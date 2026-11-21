import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';
import { docClient, CORS_HEADERS } from '../lib/awsClients.js';
import { getAuthenticatedUser } from '../lib/authUtils.js';
import { publishToRecipient } from '../lib/notifications.js';

const TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'DocumentsMetadata';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'ClouddocUsers';
const SHARE_LINKS_TABLE = process.env.SHARE_LINKS_TABLE_NAME || 'ShareLinks';
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function generateShareCode(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function createShortShareCode(item, maxAttempts = 5) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shareCode = generateShareCode(10);
    try {
      await docClient.send(new PutCommand({
        TableName: SHARE_LINKS_TABLE,
        Item: { ShareCode: shareCode, ...item },
        ConditionExpression: 'attribute_not_exists(ShareCode)',
      }));
      return shareCode;
    } catch (err) {
      if (err?.name === 'ConditionalCheckFailedException') continue;
      throw err;
    }
  }
  throw new Error('Failed to generate a unique short share link');
}

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

    const sanitizedExpiry = Math.min(Math.max(parseInt(expiresIn, 10) || 3600, 60), 604800);
    const normalizedPerm = permission.toUpperCase();

    // View-only sharing: keep it simple and safe.
    if (normalizedPerm !== 'VIEW') {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Only VIEW sharing is supported.' }),
      };
    }
    const actionType = 'GET';

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

    const nowIso = new Date().toISOString();
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { DocumentID: documentId },
      UpdateExpression: 'SET SharedStatus = :sharedStatus, LastSharedAt = :sharedAt, SharedWith = :sharedWith',
      ExpressionAttributeValues: {
        ':sharedStatus': 'SHARED',
        ':sharedAt': nowIso,
        ':sharedWith': updatedSharedWith,
      },
    }));

    const expiresAtEpoch = Math.floor(Date.now() / 1000) + sanitizedExpiry;
    const expiresAt = new Date(expiresAtEpoch * 1000).toISOString();
    const shareCode = await createShortShareCode({
      DocumentID: documentId,
      OwnerID: doc.OwnerID,
      FileName: doc.FileName,
      Permission: normalizedPerm,
      CreatedBy: callerId,
      CreatedByEmail: authUser.email || '',
      TargetUserId: rawTarget || '',
      CreatedAt: nowIso,
      ExpiresAt: expiresAt,
      ExpiresAtEpoch: expiresAtEpoch,
    });
    const shareUrl = `${FRONTEND_BASE_URL}/s/${shareCode}`;

    // 5. Email the recipient. SNS routes this to targetEmail only.
    if (targetEmail) {
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
          expiresAt,
          sharedAt: nowIso,
          shareUrl,
          note: 'Use the share link to open this document. The link will expire at the time shown above.',
        },
      });
      console.log(`[SNS] Share notification for ${targetEmail}: ${notified ? 'published' : 'skipped'}`);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Short share link generated successfully',
        documentId,
        fileName: doc.FileName,
        permission: normalizedPerm,
        targetUserId: targetUserId || 'Public/Tokenized',
        httpMethod: actionType,
        expiresInSeconds: sanitizedExpiry,
        expiresAt,
        shareUrl,
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
