import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SNSClient } from '@aws-sdk/client-sns';

const region = process.env.AWS_REGION || 'us-east-1';

// Amazon S3 Client for Document Storage
export const s3Client = new S3Client({ region });

// Amazon DynamoDB Document Client for high-level JS Object mapping
const rawDynamoClient = new DynamoDBClient({ region });
export const docClient = DynamoDBDocumentClient.from(rawDynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: true,
  },
});

// Amazon SNS Client for upload/sharing notifications
export const snsClient = new SNSClient({ region });

// Standardized CORS headers for API Gateway responses
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};
