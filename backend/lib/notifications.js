import {
  SubscribeCommand,
  GetSubscriptionAttributesCommand,
  SetSubscriptionAttributesCommand,
  PublishCommand,
} from '@aws-sdk/client-sns';
import { snsClient } from './awsClients.js';

const TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';

/**
 * Per-user email notifications on a single SNS topic.
 *
 * SNS itself has no concept of a "recipient" - a Publish call fans out to every
 * confirmed subscription. To route an alert to one person we:
 *   1. subscribe that person's email with a FilterPolicy on the `recipient`
 *      message attribute, and
 *   2. publish every alert with `recipient = <their email>`.
 *
 * Only the subscription whose filter matches receives the email. The admin
 * subscription (if any) is filtered the same way, so it no longer receives
 * every user's upload alerts.
 */
export const NotificationStatus = {
  CONFIRMED: 'CONFIRMED',
  PENDING: 'PENDING',
  DISABLED: 'DISABLED',
  UNKNOWN: 'UNKNOWN',
  ERROR: 'ERROR',
};

export function notificationsEnabled() {
  return Boolean(TOPIC_ARN);
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function filterPolicyFor(email) {
  return JSON.stringify({ recipient: [email] });
}

/**
 * Read the current state of a subscription and (when confirmed) re-assert the
 * filter policy, because Subscribe attributes are not guaranteed to be applied
 * to an already-existing subscription.
 */
export async function refreshSubscription(subscriptionArn, email) {
  const normalized = normalizeEmail(email);

  if (!TOPIC_ARN) {
    return { email: normalized, status: NotificationStatus.DISABLED };
  }
  if (!subscriptionArn) {
    return { email: normalized, status: NotificationStatus.UNKNOWN };
  }

  try {
    const result = await snsClient.send(
      new GetSubscriptionAttributesCommand({ SubscriptionArn: subscriptionArn })
    );
    const attributes = result.Attributes || {};
    const isPending = attributes.PendingConfirmation === 'true';
    const status = isPending ? NotificationStatus.PENDING : NotificationStatus.CONFIRMED;

    if (status === NotificationStatus.CONFIRMED) {
      await snsClient
        .send(
          new SetSubscriptionAttributesCommand({
            SubscriptionArn: subscriptionArn,
            AttributeName: 'FilterPolicy',
            AttributeValue: filterPolicyFor(normalized),
          })
        )
        .catch((err) => {
          console.warn('[Notifications] Could not re-assert filter policy:', err.message);
        });
    }

    return { email: normalized, status, subscriptionArn };
  } catch (error) {
    console.warn('[Notifications] refreshSubscription failed:', error.message);
    return {
      email: normalized,
      status: NotificationStatus.UNKNOWN,
      subscriptionArn,
      error: error.message,
    };
  }
}

/**
 * Create (or reuse) a filtered email subscription for one address.
 * The recipient receives an AWS "Subscription Confirmation" email that must be
 * clicked once before any notification is delivered.
 */
export async function subscribeEmail(email) {
  const normalized = normalizeEmail(email);

  if (!TOPIC_ARN) {
    return { email: normalized, status: NotificationStatus.DISABLED };
  }
  if (!normalized) {
    return { email: '', status: NotificationStatus.DISABLED };
  }

  try {
    const result = await snsClient.send(
      new SubscribeCommand({
        TopicArn: TOPIC_ARN,
        Protocol: 'email',
        Endpoint: normalized,
        ReturnSubscriptionArn: true,
        Attributes: {
          FilterPolicy: filterPolicyFor(normalized),
          FilterPolicyScope: 'MessageAttributes',
        },
      })
    );

    return await refreshSubscription(result.SubscriptionArn, normalized);
  } catch (error) {
    console.error('[Notifications] subscribeEmail failed:', error);
    return { email: normalized, status: NotificationStatus.ERROR, error: error.message };
  }
}

/**
 * Publish one alert addressed to a single email address.
 * Never throws - notification failures must not break uploads or shares.
 */
export async function publishToRecipient({ recipientEmail, event, subject, payload }) {
  const normalized = normalizeEmail(recipientEmail);

  if (!TOPIC_ARN || !normalized) {
    return false;
  }

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: TOPIC_ARN,
        Subject: subject,
        Message: JSON.stringify(
          { event, recipient: normalized, ...payload },
          null,
          2
        ),
        MessageAttributes: {
          recipient: { DataType: 'String', StringValue: normalized },
          event: { DataType: 'String', StringValue: event },
        },
      })
    );
    return true;
  } catch (error) {
    console.error('[Notifications] publishToRecipient failed:', error);
    return false;
  }
}
