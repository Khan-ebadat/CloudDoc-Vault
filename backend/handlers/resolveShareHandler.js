import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient, s3Client, CORS_HEADERS } from '../lib/awsClients.js';

const SHARE_LINKS_TABLE = process.env.SHARE_LINKS_TABLE_NAME || 'ShareLinks';
const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE_NAME || 'DocumentsMetadata';
const BUCKET_NAME = process.env.DOCUMENTS_BUCKET_NAME || 'clouddoc-vault-documents';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Preflight OK' }) };
  }

  try {
    const code = event.pathParameters?.code?.trim();
    if (!code) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing share code' }) };
    }

    const shareResult = await docClient.send(new GetCommand({
      TableName: SHARE_LINKS_TABLE,
      Key: { ShareCode: code },
    }));

    const share = shareResult.Item;
    if (!share) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Share link not found or expired' }) };
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    if (!share.ExpiresAtEpoch || share.ExpiresAtEpoch <= nowEpoch) {
      return { statusCode: 410, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Share link has expired' }) };
    }

    const docResult = await docClient.send(new GetCommand({
      TableName: DOCUMENTS_TABLE,
      Key: { DocumentID: share.DocumentID },
    }));
    const doc = docResult.Item;
    if (!doc) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Document not found' }) };
    }

    const remaining = Math.max(60, share.ExpiresAtEpoch - nowEpoch);
    const originalContentType = doc.ContentType || 'application/octet-stream';
    const isTextual = originalContentType.startsWith('text/') ||
      ['application/csv', 'application/json', 'application/xml', 'application/javascript'].includes(originalContentType);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: doc.S3Key,
      ResponseContentType: isTextual ? 'text/plain; charset=utf-8' : originalContentType,
      ResponseContentDisposition: `inline; filename="${doc.FileName}"`,
    });
    const preSignedUrl = await getSignedUrl(s3Client, command, { expiresIn: remaining });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        url: preSignedUrl,
        fileName: doc.FileName,
        contentType: doc.ContentType || 'application/octet-stream',
        expiresAt: share.ExpiresAt,
      }),
    };
  } catch (error) {
    console.error('[ResolveShareHandler Error]:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to resolve share link', details: error.message }),
    };
  }
};
