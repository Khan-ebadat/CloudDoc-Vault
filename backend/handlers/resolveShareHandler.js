import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient, s3Client, CORS_HEADERS } from '../lib/awsClients.js';
import { getAuthenticatedUser } from '../lib/authUtils.js';
import { getShareRecipient } from '../lib/shareRecipient.js';

const SHARE_LINKS_TABLE = process.env.SHARE_LINKS_TABLE_NAME || 'ShareLinks';
const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE_NAME || 'DocumentsMetadata';
const BUCKET_NAME = process.env.DOCUMENTS_BUCKET_NAME || 'clouddoc-vault-documents';

// A freshly generated URL is only valid long enough to start the download,
// and must never outlive the share link itself.
const MAX_PRESIGNED_URL_SECONDS = 60;

/**
 * Resolve a short share link for its intended recipient.
 *
 * Authorization is based on the verified login token and the recipient stored
 * with the link - never on possession of the share code or on browser-supplied
 * identity fields. No S3 URL is generated until every check has passed.
 */
export async function resolveShare(event, dependencies = {}) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Preflight OK' }) };
  }

  const client = dependencies.docClient || docClient;
  const signUrl = dependencies.getSignedUrl || getSignedUrl;
  const storageClient = dependencies.s3Client || s3Client;
  const nowEpoch = dependencies.now ? dependencies.now() : Math.floor(Date.now() / 1000);

  try {
    // 1. A signed-in CloudDoc Vault user is required, even with a valid code.
    const authUser = getAuthenticatedUser(event);
    if (!authUser?.userId) {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    const code = event.pathParameters?.code?.trim();
    if (!code) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing share code' }) };
    }

    const shareResult = await client.send(new GetCommand({
      TableName: SHARE_LINKS_TABLE,
      Key: { ShareCode: code },
    }));

    const share = shareResult.Item;
    if (!share) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Share link not found or expired' }) };
    }

    // 2. Recipient check happens before touching document metadata or S3.
    //    Old records with no recipient information fail closed.
    const recipient = getShareRecipient(share);
    if (!recipient || recipient.userId !== authUser.userId) {
      return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: 'This share link is not intended for your account' }) };
    }

    if (!share.ExpiresAtEpoch || share.ExpiresAtEpoch <= nowEpoch) {
      return { statusCode: 410, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Share link has expired' }) };
    }

    const docResult = await client.send(new GetCommand({
      TableName: DOCUMENTS_TABLE,
      Key: { DocumentID: share.DocumentID },
    }));
    const doc = docResult.Item;
    if (!doc) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Document not found' }) };
    }

    const remaining = share.ExpiresAtEpoch - nowEpoch;
    const expiresInSeconds = Math.min(MAX_PRESIGNED_URL_SECONDS, remaining);
    if (expiresInSeconds < 1) {
      return { statusCode: 410, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Share link has expired' }) };
    }

    const originalContentType = doc.ContentType || 'application/octet-stream';
    const isTextual = originalContentType.startsWith('text/') ||
      ['application/csv', 'application/json', 'application/xml', 'application/javascript'].includes(originalContentType);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: doc.S3Key,
      ResponseContentType: isTextual ? 'text/plain; charset=utf-8' : originalContentType,
      ResponseContentDisposition: `inline; filename="${doc.FileName}"`,
    });
    const preSignedUrl = await signUrl(storageClient, command, { expiresIn: expiresInSeconds });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        url: preSignedUrl,
        fileName: doc.FileName,
        contentType: doc.ContentType || 'application/octet-stream',
        expiresAt: share.ExpiresAt,
        expiresInSeconds,
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
}

export const handler = async (event) => resolveShare(event);
