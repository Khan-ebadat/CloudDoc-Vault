import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { docClient, CORS_HEADERS } from '../lib/awsClients.js';
import { hashPassword, verifyPassword, generateToken, getAuthenticatedUser } from '../lib/authUtils.js';
import {
  subscribeEmail,
  refreshSubscription,
  normalizeEmail,
  NotificationStatus,
  publishToRecipient,
} from '../lib/notifications.js';

const USERS_TABLE = process.env.USERS_TABLE_NAME || 'ClouddocUsers';
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const RESET_TOKEN_TTL_SECONDS = 60 * 15; // 15 minutes

function hashResetToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Store the per-user email notification state on the ClouddocUsers record so
 * later logins can report it without re-sending confirmation emails.
 */
async function persistNotificationState(email, state) {
  const values = {
    ':notificationEmail': state.email || email,
    ':notificationStatus': state.status || NotificationStatus.UNKNOWN,
    ':now': new Date().toISOString(),
  };

  let updateExpression =
    'SET NotificationEmail = :notificationEmail, NotificationStatus = :notificationStatus, UpdatedAt = :now';

  if (state.subscriptionArn) {
    updateExpression += ', NotificationSubscriptionArn = :notificationSubscriptionArn';
    values[':notificationSubscriptionArn'] = state.subscriptionArn;
  }

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { Email: email },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values,
      })
    );
  } catch (error) {
    console.warn('[AuthHandler] Could not persist notification state:', error.message);
  }
}

/**
 * Resolve the notification state for a user:
 *  - reuse a known subscription (confirmed or pending), or
 *  - create a new filtered email subscription (sends one AWS confirmation mail).
 */
async function resolveNotificationState(user) {
  const email = normalizeEmail(user.Email);

  if (!email) {
    return { email: '', status: NotificationStatus.DISABLED };
  }

  if (user.NotificationSubscriptionArn) {
    const current = await refreshSubscription(user.NotificationSubscriptionArn, email);
    if (
      current.status === NotificationStatus.CONFIRMED ||
      current.status === NotificationStatus.PENDING
    ) {
      return current;
    }
  }

  return subscribeEmail(email);
}

/**
 * Lambda handler for User Authentication: Signup & Login
 * Endpoints:
 * - POST /auth/signup: Register new user with hashed credentials in ClouddocUsers table
 * - POST /auth/login: Authenticate credentials and issue JWT session token
 */
export const handler = async (event) => {
  console.log('Incoming Auth Request:', JSON.stringify({
    path: event.path,
    httpMethod: event.httpMethod,
  }));

  // Handle CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Preflight OK' }),
    };
  }

  try {
    // ==========================================
    // 0. NOTIFICATION STATUS (GET /auth/notifications)
    // ==========================================
    if (event.httpMethod === 'GET' && event.path?.endsWith('/notifications')) {
      const authUser = getAuthenticatedUser(event);
      if (!authUser?.email) {
        return {
          statusCode: 401,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Authentication required' }),
        };
      }

      const email = normalizeEmail(authUser.email);
      const userResult = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { Email: email },
      }));

      if (!userResult.Item) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'User account not found' }),
        };
      }

      const notifications = await resolveNotificationState(userResult.Item);
      await persistNotificationState(email, notifications);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ notifications }),
      };
    }

    const path = event.path || '';
    const isForgotPassword = event.httpMethod === 'POST' && path.endsWith('/forgot-password');
    const isResetPassword = event.httpMethod === 'POST' && path.endsWith('/reset-password');

    if (!event.body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

    // ==========================================
    // 1. FORGOT PASSWORD FLOW
    // ==========================================
    if (isForgotPassword) {
      const email = normalizeEmail(payload.email);
      const genericMessage = 'If an account exists for this email, a password reset link has been sent.';

      if (!email) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Email is required' }),
        };
      }

      const userResult = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { Email: email },
      }));

      if (!userResult.Item) {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: genericMessage }),
        };
      }

      const user = userResult.Item;
      const resetToken = randomBytes(32).toString('hex');
      const resetTokenHash = hashResetToken(resetToken);
      const resetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000).toISOString();

      await docClient.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { Email: email },
        UpdateExpression: 'SET ResetTokenHash = :hash, ResetTokenExpiresAt = :exp, ResetTokenRequestedAt = :now, UpdatedAt = :now',
        ExpressionAttributeValues: {
          ':hash': resetTokenHash,
          ':exp': resetExpiresAt,
          ':now': new Date().toISOString(),
        },
      }));

      const resetUrl = `${FRONTEND_BASE_URL}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;

      await publishToRecipient({
        recipientEmail: email,
        event: 'PASSWORD_RESET',
        subject: '[CloudDoc Vault] Reset your password',
        payload: {
          resetUrl,
          expiresAt: resetExpiresAt,
          expiresInMinutes: Math.floor(RESET_TOKEN_TTL_SECONDS / 60),
          note: 'If you did not request this, you can ignore this message. The link expires in 15 minutes.',
        },
      });

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: genericMessage }),
      };
    }

    // ==========================================
    // 2. RESET PASSWORD FLOW
    // ==========================================
    if (isResetPassword) {
      const email = normalizeEmail(payload.email);
      const token = String(payload.token || '').trim();
      const newPassword = String(payload.newPassword || '');

      if (!email || !token || !newPassword) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Email, token, and new password are required' }),
        };
      }

      if (newPassword.length < 8) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Password must be at least 8 characters long' }),
        };
      }

      const userResult = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { Email: email },
      }));

      if (!userResult.Item) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid or expired reset link' }),
        };
      }

      const user = userResult.Item;
      const tokenHash = hashResetToken(token);
      const expiresAt = user.ResetTokenExpiresAt ? Date.parse(user.ResetTokenExpiresAt) : 0;

      if (!user.ResetTokenHash || user.ResetTokenHash !== tokenHash || !expiresAt || Date.now() > expiresAt) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid or expired reset link' }),
        };
      }

      const { salt, hash } = hashPassword(newPassword);
      const nowIso = new Date().toISOString();

      await docClient.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { Email: email },
        UpdateExpression: 'SET PasswordHash = :hash, Salt = :salt, UpdatedAt = :now REMOVE ResetTokenHash, ResetTokenExpiresAt, ResetTokenRequestedAt',
        ExpressionAttributeValues: {
          ':hash': hash,
          ':salt': salt,
          ':now': nowIso,
        },
      }));

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'Password reset successful. You can now sign in with your new password.' }),
      };
    }

    const isSignup = path.endsWith('/signup') || payload.action === 'signup';

    // ==========================================
    // 1. SIGNUP FLOW
    // ==========================================
    if (isSignup) {
      const { email, password, fullName } = payload;

      if (!email || !password || !fullName) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Missing required fields: email, password, fullName' }),
        };
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check if user already exists
      const existingUser = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { Email: normalizedEmail },
      }));

      if (existingUser.Item) {
        return {
          statusCode: 409,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'An account with this email address already exists' }),
        };
      }

      // Hash password and save new user record
      const { salt, hash } = hashPassword(password);
      const userId = `usr_${randomUUID()}`;
      const nowIso = new Date().toISOString();

      const newUserItem = {
        Email: normalizedEmail,
        UserID: userId,
        FullName: fullName.trim(),
        PasswordHash: hash,
        Salt: salt,
        Role: 'STANDARD_USER',
        CreatedAt: nowIso,
        UpdatedAt: nowIso,
      };

      await docClient.send(new PutCommand({
        TableName: USERS_TABLE,
        Item: newUserItem,
      }));

      // Subscribe this address to its own filtered notifications.
      // The user must click the AWS confirmation email once before alerts arrive.
      const notifications = await subscribeEmail(normalizedEmail);
      await persistNotificationState(normalizedEmail, notifications);

      const token = generateToken({
        userId,
        email: normalizedEmail,
        fullName: newUserItem.FullName,
        role: newUserItem.Role,
      });

      return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'Account created successfully',
          token,
          user: {
            userId,
            email: normalizedEmail,
            fullName: newUserItem.FullName,
            role: newUserItem.Role,
            notifications,
          },
        }),
      };
    }

    // ==========================================
    // 2. LOGIN FLOW
    // ==========================================
    const { email, password } = payload;
    if (!email || !password) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing email or password' }),
      };
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query user record by Email
    const userResult = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { Email: normalizedEmail },
    }));

    if (!userResult.Item) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid email or password' }),
      };
    }

    const user = userResult.Item;
    const isPasswordValid = verifyPassword(password, user.PasswordHash, user.Salt);

    if (!isPasswordValid) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid email or password' }),
      };
    }

    const token = generateToken({
      userId: user.UserID,
      email: user.Email,
      fullName: user.FullName,
      role: user.Role || 'STANDARD_USER',
    });

    // Re-check (or create) this user's filtered email subscription on login.
    const notifications = await resolveNotificationState(user);
    await persistNotificationState(user.Email, notifications);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Login successful',
        token,
        user: {
          userId: user.UserID,
          email: user.Email,
          fullName: user.FullName,
          role: user.Role || 'STANDARD_USER',
          notifications,
        },
      }),
    };
  } catch (error) {
    console.error('[AuthHandler Error]:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Authentication service failure', details: error.message }),
    };
  }
};
