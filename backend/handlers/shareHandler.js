import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';
import { docClient, CORS_HEADERS } from '../lib/awsClients.js';
import { getAuthenticatedUser } from '../lib/authUtils.js';
import { publishToRecipient } from '../lib/notifications.js';
import { resolveRecipientAccount } from '../lib/shareRecipient.js';

const TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'DocumentsMetadata';
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
 * Create a short, recipient-restricted share link.
 *
 * The S3 URL is deliberately NOT created here: the recipient's signed-in
 * identity is checked by resolveShareHandler before any URL is generated.
 */
export async function createShare(event, dependencies = {}) {
  // Handle CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Preflight OK' }),
    };
  }

  const client = dependencies.docClient || docClient;
  const publish = dependencies.publishToRecipient || publishToRecipient;
  const createCode = dependencies.createShortShareCode || createShortShareCode;
  const currentTime = dependencies.now ? dependencies.now() : new Date();

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
    const {
      documentId,
      permission = 'VIEW',
      expiresIn = 3600,
      recipient = '',
      targetUserId = '',
      recipientEmail = '',
    } = payload;
    // `targetUserId` is accepted for existing clients; `recipient` is the
    // preferred name. All forms must identify a real CloudDoc Vault account.
    const rawRecipient = String(recipient || targetUserId || recipientEmail || '').trim();

    if (!documentId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required field: documentId' }),
      };
    }

    if (!rawRecipient) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required field: recipient' }),
      };
    }

    // 1. Fetch document metadata from DynamoDB 'DocumentsMetadata'
    const getResult = await client.send(new GetCommand({
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

    // 3. Resolve the recipient: links can only be shared with an existing
    //    CloudDoc Vault account, never with a bare/tokenized identifier.
    const account = await resolveRecipientAccount(rawRecipient, client);
    if (!account) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Recipient account not found' }),
      };
    }

    // 4. Update SharedWith array in DynamoDB
    const existingSharedWith = Array.isArray(doc.SharedWith) ? doc.SharedWith : [];
    const updatedSharedWith = existingSharedWith.filter(
      (s) =>
        s.userId !== account.userId &&
        (s.email || '').toLowerCase() !== account.email
    );
    updatedSharedWith.push({
      userId: account.userId,
      email: account.email,
      permission: normalizedPerm,
      sharedBy: callerId,
      sharedByName: authUser.fullName || 'Vault Owner',
      sharedAt: currentTime.toISOString(),
    });

    const nowIso = currentTime.toISOString();
    await client.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { DocumentID: documentId },
      UpdateExpression: 'SET SharedStatus = :sharedStatus, LastSharedAt = :sharedAt, SharedWith = :sharedWith',
      ExpressionAttributeValues: {
        ':sharedStatus': 'SHARED',
        ':sharedAt': nowIso,
        ':sharedWith': updatedSharedWith,
      },
    }));

    const expiresAtEpoch = Math.floor(currentTime.getTime() / 1000) + sanitizedExpiry;
    const expiresAt = new Date(expiresAtEpoch * 1000).toISOString();
    const shareCode = await createCode({
      DocumentID: documentId,
      OwnerID: doc.OwnerID,
      FileName: doc.FileName,
      Permission: normalizedPerm,
      CreatedBy: callerId,
      CreatedByEmail: authUser.email || '',
      // Explicit recipient fields are authoritative at resolution time.
      RecipientUserId: account.userId,
      RecipientEmail: account.email,
      // Kept for backwards compatibility with existing consumers of the
      // share-link record; now always the resolved account ID / email.
      TargetUserId: account.userId,
      TargetEmail: account.email,
      CreatedAt: nowIso,
      ExpiresAt: expiresAt,
      ExpiresAtEpoch: expiresAtEpoch,
    });
    const shareUrl = `${FRONTEND_BASE_URL}/s/${shareCode}`;

    // 5. Email the recipient. SNS routes this to the verified account email.
    const notified = await publish({
      recipientEmail: account.email,
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
        note: 'Sign in to CloudDoc Vault with your account, then open this link to view the document.',
      },
    });
    console.log(`[SNS] Share notification for ${account.email}: ${notified ? 'published' : 'skipped'}`);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Short share link generated successfully',
        documentId,
        fileName: doc.FileName,
        permission: normalizedPerm,
        targetUserId: account.userId,
        targetEmail: account.email,
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
      body: JSON.stringify({ error: 'Failed to generate share link', details: error.message }),
    };
  }
}

export const handler = async (event) => createShare(event);
