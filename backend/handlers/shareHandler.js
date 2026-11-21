import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { s3Client, docClient, CORS_HEADERS } from '../lib/awsClients.js';
import { getAuthenticatedUser } from '../lib/authUtils.js';
import { publishToRecipient } from '../lib/notifications.js';

const BUCKET_NAME = process.env.DOCUMENTS_BUCKET_NAME || 'clouddoc-vault-documents';
const TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'DocumentsMetadata';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'ClouddocUsers';

/**
 * Lambda handler for generating secure S3 Pre-Signed URLs (GET/PUT)
 * and managing granular document sharing permissions per User ID in DynamoDB.
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
    const callerId = authUser.userId;

    if (!event.body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Request body is empty' }),
      };
    }

    const payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { documentId, permission = 'VIEW', expiresIn = 3600, targetUserId = '' } = payload;

    if (!documentId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required field: documentId' }),
      };
    }

    // 1. Fetch document metadata from DynamoDB 'DocumentsMetadata'
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

    // 2. Permission check: Caller must be owner or have EDIT rights
    if (callerId && doc.OwnerID && doc.OwnerID !== callerId) {
      const isAuthorizedEditor = Array.isArray(doc.SharedWith) && doc.SharedWith.some(
        (s) => (s.userId === callerId || s.email === authUser?.email) && (s.permission === 'EDIT' || s.permission === 'WRITE')
      );

      if (!isAuthorizedEditor) {
        return {
          statusCode: 403,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Unauthorized: You do not have permission to share this document.' }),
        };
      }
    }

    const s3Key = doc.S3Key;
    const sanitizedExpiry = Math.min(Math.max(parseInt(expiresIn, 10) || 3600, 60), 604800);
    const normalizedPerm = permission.toUpperCase();

    let preSignedUrl = '';
    let actionType = '';

    // 3. Generate Pre-Signed URL with SigV4
    if (normalizedPerm === 'VIEW') {
      actionType = 'GET';
      const originalContentType = doc.ContentType || 'application/octet-stream';
      const isTextual = originalContentType.startsWith('text/') ||
        ['application/csv', 'application/json', 'application/xml', 'application/javascript'].includes(originalContentType);
      const getCmd = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ResponseContentType: isTextual ? 'text/plain; charset=utf-8' : originalContentType,
        ResponseContentDisposition: `inline; filename="${doc.FileName}"`,
      });
      preSignedUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: sanitizedExpiry });
    } else if (normalizedPerm === 'WRITE' || normalizedPerm === 'EDIT') {
      actionType = 'PUT';
      const putCmd = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ContentType: doc.ContentType || 'application/octet-stream',
      });
      preSignedUrl = await getSignedUrl(s3Client, putCmd, { expiresIn: sanitizedExpiry });
    } else {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `Invalid permission: ${permission}. Must be VIEW, EDIT, or WRITE.` }),
      };
    }

    // 4. Update SharedWith array in DynamoDB
    const existingSharedWith = Array.isArray(doc.SharedWith) ? doc.SharedWith : [];
    let updatedSharedWith = [...existingSharedWith];

    const rawTarget = String(targetUserId || '').trim();
    let resolvedTargetId = rawTarget;
    let targetEmail = '';

    // Resolve an email recipient to their real UserID (if they have an account)
    if (rawTarget.includes('@')) {
      targetEmail = rawTarget.toLowerCase();
      const targetUser = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { Email: targetEmail },
      }));
      resolvedTargetId = targetUser.Item?.UserID || targetEmail;
    }

    if (rawTarget) {
      // Remove any previous entry for target user to update cleanly
      updatedSharedWith = updatedSharedWith.filter(
        (s) =>
          s.userId !== resolvedTargetId &&
          s.userId !== rawTarget &&
          (s.email || '').toLowerCase() !== targetEmail
      );
      updatedSharedWith.push({
        userId: resolvedTargetId,
        ...(targetEmail ? { email: targetEmail } : {}),
        permission: normalizedPerm,
        sharedBy: callerId,
        sharedByName: authUser.fullName || 'Vault Owner',
        sharedAt: new Date().toISOString(),
      });
    }

    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { DocumentID: documentId },
      UpdateExpression: 'SET SharedStatus = :sharedStatus, LastSharedAt = :sharedAt, SharedWith = :sharedWith',
      ExpressionAttributeValues: {
        ':sharedStatus': 'SHARED',
        ':sharedAt': new Date().toISOString(),
        ':sharedWith': updatedSharedWith,
      },
    }));

    // 5. Email the recipient. SNS routes this to targetEmail only, via the
    //    subscription filter policy on the `recipient` message attribute.
    if (targetEmail) {
      const sharedAt = new Date().toISOString();
      const notified = await publishToRecipient({
        recipientEmail: targetEmail,
        event: 'DOCUMENT_SHARED',
        subject: `[CloudDoc Vault] ${authUser.fullName || 'A vault owner'} shared "${doc.FileName}" with you`,
        payload: {
          documentId,
          fileName: doc.FileName,
          permission: normalizedPerm,
          sharedByName: authUser.fullName || 'Vault Owner',
          sharedByEmail: authUser.email || '',
          expiresInSeconds: sanitizedExpiry,
          expiresAt: new Date(Date.now() + sanitizedExpiry * 1000).toISOString(),
          sharedAt,
          note: 'Sign in to CloudDoc Vault to open this document. For security, access links are not included in email.',
        },
      });
      console.log(`[SNS] Share notification for ${targetEmail}: ${notified ? 'published' : 'skipped'}`);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Pre-signed URL generated successfully',
        documentId,
        fileName: doc.FileName,
        permission: normalizedPerm,
        targetUserId: targetUserId || 'Public/Tokenized',
        httpMethod: actionType,
        expiresInSeconds: sanitizedExpiry,
        expiresAt: new Date(Date.now() + sanitizedExpiry * 1000).toISOString(),
        preSignedUrl,
      }),
    };
  } catch (error) {
    console.error('[ShareHandler Error]:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to generate pre-signed link', details: error.message }),
    };
  }
};
