import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { s3Client, docClient, CORS_HEADERS } from '../lib/awsClients.js';
import { getAuthenticatedUser } from '../lib/authUtils.js';

const BUCKET_NAME = process.env.DOCUMENTS_BUCKET_NAME || 'clouddoc-vault-documents';
const TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'DocumentsMetadata';
const URL_TTL_SECONDS = 900; // 15-minute preview window

/**
 * Lambda handler that generates a short-lived S3 Pre-Signed GET URL so a
 * user can open/preview a document in the browser.
 *
 * Access rules:
 *  - Owner: always allowed
 *  - Shared user (matched by UserID or Email): allowed
 *
 * Endpoint: GET /documents/{documentId}/download
 * Optional query string: ?download=1 forces an attachment download.
 */
export const handler = async (event) => {
  // Handle CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Preflight OK' }),
    };
  }

  try {
    const authUser = getAuthenticatedUser(event);
    if (!authUser?.userId) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Authentication required' }),
      };
    }

    const documentId = event.pathParameters?.documentId;
    if (!documentId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required path parameter: documentId' }),
      };
    }

    const getResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { DocumentID: documentId },
    }));

    if (!getResult.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `Document not found with ID: ${documentId}` }),
      };
    }

    const doc = getResult.Item;
    const callerEmail = (authUser.email || '').toLowerCase();

    const isOwner = doc.OwnerID === authUser.userId;
    const share = Array.isArray(doc.SharedWith)
      ? doc.SharedWith.find(
          (s) => s.userId === authUser.userId || (s.email || '').toLowerCase() === callerEmail
        )
      : null;

    if (!isOwner && !share) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Unauthorized: this document has not been shared with you.' }),
      };
    }

    const forceDownload = event.queryStringParameters?.download === '1';
    const safeFileName = String(doc.FileName || 'document').replace(/"/g, '');
    const originalContentType = doc.ContentType || 'application/octet-stream';

    // Browsers download text/csv, application/json, etc. even with an inline
    // disposition because they have no built-in renderer. Serve those as text
    // for previews so they open in the tab; keep the real MIME for downloads.
    const isTextual = originalContentType.startsWith('text/') ||
      ['application/csv', 'application/json', 'application/xml', 'application/javascript'].includes(originalContentType);
    const previewContentType = !forceDownload && isTextual
      ? 'text/plain; charset=utf-8'
      : originalContentType;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: doc.S3Key,
      ResponseContentType: previewContentType,
      ResponseContentDisposition: `${forceDownload ? 'attachment' : 'inline'}; filename="${safeFileName}"`,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: URL_TTL_SECONDS });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        url,
        fileName: doc.FileName,
        contentType: previewContentType,
        expiresInSeconds: URL_TTL_SECONDS,
      }),
    };
  } catch (error) {
    console.error('[OpenHandler Error]:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to open document', details: error.message }),
    };
  }
};
