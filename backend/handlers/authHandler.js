import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient, CORS_HEADERS } from '../lib/awsClients.js';
import { hashPassword, verifyPassword, generateToken } from '../lib/authUtils.js';

const USERS_TABLE = process.env.USERS_TABLE_NAME || 'ClouddocUsers';

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
    if (!event.body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const payload = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const isSignup = event.path?.endsWith('/signup') || payload.action === 'signup';

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
