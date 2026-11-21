import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { s3Client, docClient, CORS_HEADERS } from '../lib/awsClients.js';
import { getAuthenticatedUser } from '../lib/authUtils.js';

const BUCKET_NAME = process.env.DOCUMENTS_BUCKET_NAME || 'clouddoc-vault-documents';
const TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'DocumentsMetadata';

/**
 * Lambda handler for deleting a document.
 * Only the document owner may delete it.
 * Deletes the S3 object first, then removes the DynamoDB metadata row.
 *
 * Endpoint: DELETE /documents/{documentId}
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

    // 1. Load metadata to verify ownership and find the S3 key
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

    if (doc.OwnerID !== authUser.userId) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Unauthorized: only the document owner can delete this file.' }),
      };
    }

    // 2. Delete the private S3 object (idempotent if already gone)
    console.log(`[S3] Deleting s3://${BUCKET_NAME}/${doc.S3Key}`);
    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: doc.S3Key,
    }));

    // 3. Remove the DynamoDB metadata row
    console.log(`[DynamoDB] Deleting ${documentId} from ${TABLE_NAME}`);
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { DocumentID: documentId },
    }));

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Document deleted successfully',
        documentId,
        s3Key: doc.S3Key,
      }),
    };
  } catch (error) {
    console.error('[DeleteHandler Error]:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to delete document', details: error.message }),
    };
  }
};
