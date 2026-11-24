import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const USERS_TABLE = process.env.USERS_TABLE_NAME || 'ClouddocUsers';
const USER_ID_INDEX = 'UserIDIndex';

/** Emails are stored as the users-table partition key: trimmed and lowercase. */
export function normalizeRecipientEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Resolve a share recipient to a real CloudDoc Vault account.
 *
 * Returns { userId, email } only when an account actually exists, otherwise
 * null. Email input is normalized before the lookup; user IDs are checked
 * against the UsersTable UserIDIndex so arbitrary strings are never accepted.
 */
export async function resolveRecipientAccount(recipient, client) {
  const raw = String(recipient ?? '').trim();
  if (!raw) return null;

  let user;
  if (raw.includes('@')) {
    const email = normalizeRecipientEmail(raw);
    if (!email.includes('@')) return null;
    const result = await client.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { Email: email },
    }));
    user = result?.Item;
  } else {
    const result = await client.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: USER_ID_INDEX,
      KeyConditionExpression: 'UserID = :userId',
      ExpressionAttributeValues: { ':userId': raw },
      Limit: 1,
    }));
    user = result?.Items?.[0];
  }

  const email = normalizeRecipientEmail(user?.Email);
  if (!user?.UserID || !email) return null;
  return { userId: user.UserID, email };
}

/**
 * Read the intended recipient from a stored share-link record.
 *
 * New records carry RecipientUserId + RecipientEmail. Older records may only
 * have TargetUserId; those are still usable when they identify a user ID, but
 * records with no recipient details at all return null and fail closed.
 */
export function getShareRecipient(share) {
  if (!share || typeof share !== 'object') return null;

  const userId = String(share.RecipientUserId || share.TargetUserId || '').trim();
  // A bare email was sometimes stored as TargetUserId in old links. It is not
  // a user ID, so it can never authorize a share resolution.
  if (!userId || userId.includes('@')) return null;

  const email = normalizeRecipientEmail(
    share.RecipientEmail || share.TargetEmail || (typeof share.TargetUserId === 'string' && share.TargetUserId.includes('@') ? share.TargetUserId : '')
  );
  return { userId, email };
}
