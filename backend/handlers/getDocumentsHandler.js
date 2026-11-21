import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, CORS_HEADERS } from '../lib/awsClients.js';
import { getAuthenticatedUser } from '../lib/authUtils.js';

const TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'DocumentsMetadata';

/**
 * Lambda handler for retrieving documents owned by or shared with the authenticated user.
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
    const currentUserId = authUser.userId;
    const currentUserEmail = (authUser.email || '').toLowerCase();

    console.log(`[DynamoDB] Scanning documents from ${TABLE_NAME} for user ${currentUserId}`);
    const scanCommand = new ScanCommand({
      TableName: TABLE_NAME,
      Limit: 200,
    });

    const response = await docClient.send(scanCommand);
    const allDocs = response.Items || [];

    // Filter documents: Owned by current user OR shared with current user
    const userDocs = allDocs.filter((doc) => {
      const isOwner = doc.OwnerID === currentUserId;
      const isSharedWithUser = Array.isArray(doc.SharedWith) && doc.SharedWith.some(
        (share) =>
          share.userId === currentUserId ||
          (share.email || '').toLowerCase() === currentUserEmail
      );

      return isOwner || isSharedWithUser;
    });

    // Sort newest first
    userDocs.sort((a, b) => new Date(b.UploadDate).getTime() - new Date(a.UploadDate).getTime());

    // Calculate user-specific storage metrics
    let totalSizeBytes = 0;
    const categoryCount = { pdf: 0, images: 0, archives: 0, documents: 0, others: 0 };

    for (const doc of userDocs) {
      const size = Number(doc.FileSize) || 0;
      totalSizeBytes += size;

      const mime = (doc.ContentType || '').toLowerCase();
      const name = (doc.FileName || '').toLowerCase();

      if (mime.includes('pdf') || name.endsWith('.pdf')) categoryCount.pdf += 1;
      else if (mime.includes('image') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) categoryCount.images += 1;
      else if (mime.includes('zip') || /\.(zip|rar|tar|gz|7z)$/.test(name)) categoryCount.archives += 1;
      else if (mime.includes('sheet') || mime.includes('excel') || /\.(docx?|txt|md|csv|xlsx?)$/.test(name)) categoryCount.documents += 1;
      else categoryCount.others += 1;
    }

    const storageMetrics = {
      totalFiles: userDocs.length,
      totalSizeBytes,
      totalSizeFormatted: `${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
      allocatedQuotaBytes: 50 * 1024 * 1024 * 1024, // 50 GB Quota
      usedPercentage: Math.min(100, (totalSizeBytes / (50 * 1024 * 1024 * 1024)) * 100).toFixed(2),
      categories: categoryCount,
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        documents: userDocs,
        metrics: storageMetrics,
        authenticatedUser: authUser ? { userId: authUser.userId, email: authUser.email } : null,
      }),
    };
  } catch (error) {
    console.error('[GetDocumentsHandler Error]:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to retrieve documents', details: error.message }),
    };
  }
};
