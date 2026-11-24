import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Set deterministic configuration before loading the handlers (their env
// values are read at module load time).
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SHARE_LINKS_TABLE_NAME = 'ShareLinks';
process.env.DOCUMENTS_TABLE_NAME = 'DocumentsMetadata';
process.env.USERS_TABLE_NAME = 'ClouddocUsers';
process.env.DOCUMENTS_BUCKET_NAME = 'test-documents-bucket';
process.env.FRONTEND_BASE_URL = 'http://localhost:3000';

const { resolveShare } = await import('../handlers/resolveShareHandler.js');
const { createShare } = await import('../handlers/shareHandler.js');
const { generateToken } = await import('../lib/authUtils.js');
const { getShareRecipient, resolveRecipientAccount, normalizeRecipientEmail } = await import('../lib/shareRecipient.js');

const NOW = 1_800_000_000;
const CODE = 'abc123def4';
const RECIPIENT = { userId: 'usr_recipient', email: 'recipient@example.com', fullName: 'Recipient' };
const OTHER_USER = { userId: 'usr_other', email: 'other@example.com', fullName: 'Other' };
const OWNER_TOKEN = generateToken({ userId: 'usr_owner', email: 'owner@example.com', fullName: 'Owner' });

function tokenFor(user) {
  return generateToken({ userId: user.userId, email: user.email, fullName: user.fullName });
}

function makeDocClient({ share, document, user, usersByEmail = {}, usersById = [] } = {}) {
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command);
      const input = command.input || {};
      if (command instanceof PutCommand || command instanceof UpdateCommand) return {};
      if (command instanceof QueryCommand) return { Items: usersById };
      if (command instanceof GetCommand) {
        if (input.TableName === 'ShareLinks') return { Item: share };
        if (input.TableName === 'DocumentsMetadata') return { Item: document };
        if (input.TableName === 'ClouddocUsers') {
          return { Item: user === undefined ? usersByEmail[input.Key?.Email] : user };
        }
      }
      throw new Error(`Unexpected DynamoDB command: ${command.constructor.name} (${input.TableName || 'no table'})`);
    },
  };
}

const defaultDocument = {
  DocumentID: 'doc-1',
  S3Key: 'vault/usr_owner/doc-1/report.pdf',
  FileName: 'report.pdf',
  ContentType: 'application/pdf',
};

function defaultShare(overrides = {}) {
  return {
    ShareCode: CODE,
    DocumentID: 'doc-1',
    OwnerID: 'usr_owner',
    Permission: 'VIEW',
    RecipientUserId: RECIPIENT.userId,
    RecipientEmail: RECIPIENT.email,
    ExpiresAtEpoch: NOW + 600,
    ExpiresAt: new Date((NOW + 600) * 1000).toISOString(),
    ...overrides,
  };
}

function resolverSetup(shareOverrides = {}) {
  const share = defaultShare(shareOverrides);
  const docClient = makeDocClient({ share, document: defaultDocument });
  const signCalls = [];
  const deps = {
    docClient,
    s3Client: {},
    getSignedUrl: async (client, command, options) => {
      signCalls.push({ client, command, options });
      return 'https://s3.example.test/signed';
    },
    now: () => NOW,
  };
  return { deps, docClient, signCalls, share };
}

function resolveEvent(token, code = CODE) {
  return {
    httpMethod: 'GET',
    pathParameters: { code },
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

describe('resolveShareHandler recipient authorization', () => {
  it('opens the link for the intended recipient with a URL capped at 60 seconds', async () => {
    const { deps, signCalls } = resolverSetup();

    const result = await resolveShare(resolveEvent(tokenFor(RECIPIENT)), deps);
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(body.url, 'https://s3.example.test/signed');
    assert.equal(body.fileName, 'report.pdf');
    assert.equal(body.expiresInSeconds, 60);
    assert.equal(signCalls.length, 1);
    assert.equal(signCalls[0].options.expiresIn, 60);
    assert.equal(signCalls[0].command.input.Key, defaultDocument.S3Key);
  });

  it('rejects a different signed-in user before generating an S3 URL', async () => {
    const { deps, signCalls, docClient } = resolverSetup();

    const result = await resolveShare(resolveEvent(tokenFor(OTHER_USER)), deps);

    assert.equal(result.statusCode, 403);
    assert.match(JSON.parse(result.body).error, /not intended/i);
    assert.equal(signCalls.length, 0);
    // Document metadata must not be read for an unauthorized recipient.
    assert.equal(docClient.calls.length, 1);
  });

  it('ignores a recipient identity supplied by the browser', async () => {
    const { deps, signCalls } = resolverSetup();
    const event = {
      ...resolveEvent(tokenFor(OTHER_USER)),
      queryStringParameters: { userId: RECIPIENT.userId, recipientUserId: RECIPIENT.userId },
      body: JSON.stringify({ userId: RECIPIENT.userId, email: RECIPIENT.email }),
    };

    const result = await resolveShare(event, deps);

    assert.equal(result.statusCode, 403);
    assert.equal(signCalls.length, 0);
  });

  it('rejects a signed-out visitor before reading any data or signing a URL', async () => {
    const { deps, signCalls, docClient } = resolverSetup();

    const result = await resolveShare(resolveEvent(null), deps);

    assert.equal(result.statusCode, 401);
    assert.equal(signCalls.length, 0);
    assert.equal(docClient.calls.length, 0);
  });

  it('rejects an expired link even for the intended recipient', async () => {
    const { deps, signCalls } = resolverSetup({ ExpiresAtEpoch: NOW - 1 });

    const result = await resolveShare(resolveEvent(tokenFor(RECIPIENT)), deps);

    assert.equal(result.statusCode, 410);
    assert.equal(signCalls.length, 0);
  });

  it('fails closed for an old link with no recipient details', async () => {
    const { deps, signCalls, docClient } = resolverSetup({
      RecipientUserId: undefined,
      RecipientEmail: undefined,
      TargetUserId: '',
    });

    const result = await resolveShare(resolveEvent(tokenFor(RECIPIENT)), deps);

    assert.equal(result.statusCode, 403);
    assert.equal(signCalls.length, 0);
    assert.equal(docClient.calls.length, 1);
  });

  it('never lets the URL outlive a link that expires soon', async () => {
    const { deps, signCalls } = resolverSetup({ ExpiresAtEpoch: NOW + 12 });

    const result = await resolveShare(resolveEvent(tokenFor(RECIPIENT)), deps);

    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).expiresInSeconds, 12);
    assert.equal(signCalls[0].options.expiresIn, 12);
  });
});

describe('shareHandler recipient requirements', () => {
  function createEvent(token, body) {
    return {
      httpMethod: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    };
  }

  function setup({ user, usersById = [], document = defaultDocument } = {}) {
    const docClient = makeDocClient({ user, usersById, document });
    const stored = {};
    const published = [];
    const deps = {
      docClient,
      now: () => new Date(NOW * 1000),
      createShortShareCode: async (item) => {
        stored.item = item;
        return CODE;
      },
      publishToRecipient: async (message) => {
        published.push(message);
        return true;
      },
    };
    return { deps, docClient, stored, published };
  }

  it('requires a recipient', async () => {
    const { deps, docClient } = setup();

    const result = await createShare(createEvent(OWNER_TOKEN, { documentId: 'doc-1' }), deps);

    assert.equal(result.statusCode, 400);
    assert.match(JSON.parse(result.body).error, /recipient/i);
    assert.equal(docClient.calls.length, 0);
  });

  it('rejects a recipient without an existing account', async () => {
    const { deps, signCalls } = { ...setup({ user: undefined }), signCalls: [] };

    const result = await createShare(
      createEvent(OWNER_TOKEN, { documentId: 'doc-1', recipient: 'nobody@example.com' }),
      deps
    );

    assert.equal(result.statusCode, 404);
    assert.equal(signCalls.length, 0);
  });

  it('normalizes an email and stores the resolved recipient on the link', async () => {
    const { deps, stored, published } = setup({
      user: { Email: 'recipient@example.com', UserID: RECIPIENT.userId },
    });

    const result = await createShare(
      createEvent(OWNER_TOKEN, {
        documentId: 'doc-1',
        recipient: '  Recipient@Example.COM  ',
        expiresIn: 900,
      }),
      deps
    );
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.equal(stored.item.RecipientUserId, RECIPIENT.userId);
    assert.equal(stored.item.RecipientEmail, RECIPIENT.email);
    assert.equal(stored.item.TargetUserId, RECIPIENT.userId);
    assert.equal(body.targetEmail, RECIPIENT.email);
    assert.equal(published[0].recipientEmail, RECIPIENT.email);
  });

  it('resolves a user ID through the users index and stores the account email', async () => {
    const { deps, stored } = setup({
      usersById: [{ Email: 'RECIPIENT@Example.com', UserID: RECIPIENT.userId }],
    });

    const result = await createShare(
      createEvent(OWNER_TOKEN, { documentId: 'doc-1', recipient: RECIPIENT.userId }),
      deps
    );

    assert.equal(result.statusCode, 200);
    assert.equal(stored.item.RecipientUserId, RECIPIENT.userId);
    assert.equal(stored.item.RecipientEmail, RECIPIENT.email);
  });
});

describe('share recipient helpers', () => {
  it('normalizes email addresses consistently', () => {
    assert.equal(normalizeRecipientEmail('  Person@Example.COM '), 'person@example.com');
  });

  it('does not authorize a record whose target is an email rather than a user ID', () => {
    assert.equal(getShareRecipient({ TargetUserId: 'person@example.com' }), null);
  });

  it('falls back to a legacy user ID target but never to an empty one', () => {
    assert.deepEqual(getShareRecipient({ TargetUserId: 'usr_old' }), { userId: 'usr_old', email: '' });
    assert.equal(getShareRecipient({}), null);
  });

  it('does not resolve an unknown user ID', async () => {
    const client = { send: async () => ({ Items: [] }) };
    assert.equal(await resolveRecipientAccount('usr_missing', client), null);
  });
});
