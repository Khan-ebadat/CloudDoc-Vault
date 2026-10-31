import { PutObjectCommand } from '@aws-sdk/client-s3';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { PublishCommand } from '@aws-sdk/client-sns';
import { randomUUID } from 'crypto';
import { s3Client, docClient, snsClient, CORS_HEADERS } from '../lib/awsClients.js';
import { getAuthenticatedUser } from '../lib/authUtils.js';

const BUCKET_NAME = process.env.DOCUMENTS_BUCKET_NAME || 'clouddoc-vault-documents';
const TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'DocumentsMetadata';
const TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';

/**
 * Lambda handler for uploading documents under user-specific S3 prefixes,
 * saving metadata in DynamoDB 'DocumentsMetadata' table, and publishing an SNS alert.
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
    // 1. Authenticate user from JWT token
    const authUser = getAuthenticatedUser(event);
    const ownerId = authUser?.userId || 'usr_anonymous';
    const ownerName = authUser?.fullName || 'System User';
    const ownerEmail = authUser?.email || 'admin@vault.local';

    if (!event.body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Request body is empty' }),
      };
    }

    const payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { fileName, fileContentBase64, contentType, fileSize } = payload;

    if (!fileName || !fileContentBase64) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required fields: fileName or fileContentBase64' }),
      };
    }

    const documentId = `doc_${randomUUID()}`;
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // User-specific isolated S3 storage prefix
    const s3Key = `vault/${ownerId}/${documentId}/${sanitizedFileName}`;
    const fileBuffer = Buffer.from(fileContentBase64, 'base64');
    const actualSize = fileSize || fileBuffer.length;
    const mimeType = contentType || 'application/octet-stream';
    const uploadTimestamp = new Date().toISOString();

    // 2. Upload Document to S3 with AES256 Server-Side Encryption
    console.log(`[S3] Uploading file to s3://${BUCKET_NAME}/${s3Key}`);
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimeType,
      Metadata: {
        'owner-id': ownerId,
        'owner-name': ownerName,
        'original-filename': fileName,
        'document-id': documentId,
      },
      ServerSideEncryption: 'AES256',
    }));

    // 3. Persist Item Metadata into DynamoDB 'DocumentsMetadata' Table
    const documentRecord = {
      DocumentID: documentId,
      OwnerID: ownerId,
      OwnerName: ownerName,
      OwnerEmail: ownerEmail,
      FileName: fileName,
      FileSize: actualSize,
      ContentType: mimeType,
      S3Key: s3Key,
      SharedWith: [], // Array of { userId, permission, sharedAt }
      Permissions: 'PRIVATE',
      SharedStatus: 'PRIVATE',
      UploadDate: uploadTimestamp,
      CreatedAt: uploadTimestamp,
      UpdatedAt: uploadTimestamp,
    };

    console.log(`[DynamoDB] Saving record into ${TABLE_NAME}`);
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: documentRecord,
    }));

    // 4. Publish SNS Event Notification
    if (TOPIC_ARN) {
      console.log(`[SNS] Triggering event alert to ${TOPIC_ARN}`);
      await snsClient.send(new PublishCommand({
        TopicArn: TOPIC_ARN,
        Subject: `[CloudDoc Vault] File Uploaded: ${fileName}`,
        Message: JSON.stringify({
          event: 'DOCUMENT_UPLOADED',
          documentId,
          fileName,
          fileSize: `${(actualSize / 1024).toFixed(2)} KB`,
          ownerId,
          ownerName,
          timestamp: uploadTimestamp,
        }, null, 2),
      }));
    }

    return {
      statusCode: 201,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'File vaulted successfully',
        document: documentRecord,
      }),
    };
  } catch (error) {
    console.error('[UploadHandler Error]:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to process document upload', details: error.message }),
    };
  }
};
