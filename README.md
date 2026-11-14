# CloudDoc Vault: Secure Cloud Document Vault & Ephemeral Sharing Platform

CloudDoc Vault is an enterprise-grade, serverless document management vault powered by AWS services and a Next.js 14+ App Router frontend. It implements zero-trust private S3 storage under user-isolated prefixes, dual DynamoDB indexing (`ClouddocUsers` and `DocumentsMetadata`), cryptographic S3 Pre-Signed URLs (GET/PUT), and Amazon SNS automated alerts.

---

## 1. System Architecture Overview

```
[ User Browser / Next.js 14 Client ]
              |
              |-- (1) REST Requests (CORS Enabled with Bearer JWT)
              v
[ Amazon API Gateway (REST API /prod) ]
              |
   +----------+----------+----------+
   |          |          |          |
   v          v          v          v
[ auth      [ upload   [ getDocs   [ share
  Handler]    Handler]   Handler]    Handler]
   |          |          |          |
   |-- (2)    |-- (3)    |-- (4)    |-- (5)
   |  Auth    |  Write   |  Query   |  Generate
   |  Verify  |  S3 &    |  Owner & |  S3 SigV4
   |  & Token |  Dynamo  |  Shared  |  Pre-Signed URL
   v          v          v          v
[ DynamoDB:  [ Amazon   [ DynamoDB: [ Amazon
 Clouddoc      S3:       Documents   SNS:
 Users ]     vault/       Metadata]  Upload Alerts
             {userId}/               (Email)
```

---

## 2. Project Directory Tree

```
CloudDoc-Vault/
├── backend/
│   ├── handlers/
│   │   ├── authHandler.js              # Signup & login with PBKDF2 hashing & JWT sessions
│   │   ├── uploadHandler.js            # User-prefix S3 storage, metadata & per-user upload email
│   │   ├── getDocumentsHandler.js      # Retrieves owned + shared docs with storage quota analytics
│   │   ├── shareHandler.js             # Pre-signed URLs (GET/PUT) + share email to the recipient
│   │   ├── openHandler.js              # Issues short-lived GET URLs for in-browser preview
│   │   └── deleteHandler.js            # Owner-only S3 object + DynamoDB metadata deletion
│   ├── lib/
│   │   ├── authUtils.js                # PBKDF2 password hashing & zero-dependency JWT engine
│   │   ├── notifications.js            # Per-user SNS subscriptions + filtered publishes
│   │   └── awsClients.js               # AWS SDK v3 singletons & CORS configuration
│   ├── template.yaml                   # AWS SAM Infrastructure as Code (IaC)
│   ├── package.json                    # Backend dependencies (@aws-sdk/*)
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── login/page.tsx              # Standalone Login Page
│   │   ├── signup/page.tsx             # Standalone Registration Page
│   │   ├── globals.css                 # Dual Light/Dark mode glassmorphism styling
│   │   ├── layout.tsx                  # Root layout & metadata
│   │   └── page.tsx                    # Primary Security Vault Dashboard layout
│   ├── components/
│   │   ├── Navbar.tsx                  # Header with Dark/Light mode toggle & AWS health badges
│   │   ├── AuthModal.tsx               # Instant in-app Sign In & Registration modal
│   │   ├── StorageOverview.tsx         # Storage quota progress bar & category breakdown
│   │   ├── DocumentTable.tsx           # Searchable, filterable document registry table
│   │   ├── UploadModal.tsx             # File drag-and-drop & base64 upload modal
│   │   ├── ShareModal.tsx              # Pre-signed link modal (View, Edit, Write & Expiry)
│   │   ├── DeleteConfirmModal.tsx      # Owner-only permanent delete confirmation
│   │   ├── NotificationBanner.tsx      # Prompts the user to confirm their SNS email subscription
│   │   └── NotificationBell.tsx        # Share notifications with unread badge & quick open
│   ├── lib/
│   │   ├── api.ts                      # REST client with offline fallback demo mode
│   │   └── types.ts                    # TypeScript data models
│   ├── tailwind.config.ts              # Custom vault palette & dark mode configuration
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.example
└── README.md
```

### 2.1 Where Your Data Lives in AWS (current deployment)

| Data | AWS service | Exact location |
|---|---|---|
| Uploaded files | Amazon S3 | `s3://clouddoc-vault-docs-799517333955-ap-south-1/vault/{userId}/{documentId}/{fileName}` |
| User accounts | DynamoDB | Table `ClouddocUsers` (partition key `Email`, GSI `UserIDIndex`) |
| Document metadata & sharing | DynamoDB | Table `DocumentsMetadata` (partition key `DocumentID`, GSI `OwnerIDIndex`) |
| Upload/share alerts | Amazon SNS | `arn:aws:sns:ap-south-1:799517333955:CloudDocVault_Events` (one filtered email subscription per user) |
| Lambda logs | CloudWatch Logs | `/aws/lambda/clouddoc-vault-*` |
| REST API | API Gateway | `https://c04zvobpc0.execute-api.ap-south-1.amazonaws.com/prod` |
| SAM deployment artifacts | Amazon S3 | `s3://clouddoc-vault-sam-artifacts-799517333955-ap-south-1/clouddoc-vault/` |
| Infrastructure state | CloudFormation | Stack `clouddoc-vault` (region `ap-south-1`) |

> These values are specific to the current AWS account `799517333955`. If you deploy to another account/region, update this table and `frontend/.env.local`.

### 2.2 How email notifications are routed

SNS `Publish` has no recipient field - a message fans out to **every confirmed subscription** on the
topic. CloudDoc Vault gets per-user delivery by pairing each subscription with a filter policy:

```
Topic: CloudDocVault_Events
├── email -> alice@example.com   FilterPolicy {"recipient":["alice@example.com"]}   CONFIRMED
├── email -> bob@example.com     FilterPolicy {"recipient":["bob@example.com"]}     PENDING
└── email -> admin@example.com   (no filter policy = receives every event)
```

- `uploadHandler` publishes `DOCUMENT_UPLOADED` with `recipient = <uploader email>`.
- `shareHandler` publishes `DOCUMENT_SHARED` with `recipient = <recipient email>`.
- Each user's subscription is created on signup/login by `backend/lib/notifications.js`.
- The user record in `ClouddocUsers` stores `NotificationEmail`, `NotificationStatus`
  (`PENDING` / `CONFIRMED`), and `NotificationSubscriptionArn`.
- `GET /auth/notifications` refreshes that state; the dashboard banner shows until the user
  clicks the AWS confirmation link.

Useful commands:

```powershell
# See every subscription and who it points at
aws sns list-subscriptions-by-topic `
  --topic-arn arn:aws:sns:ap-south-1:799517333955:CloudDocVault_Events `
  --region ap-south-1

# Make an address receive only its own alerts
aws sns set-subscription-attributes --subscription-arn <sub-arn> `
  --attribute-name FilterPolicy `
  --attribute-value '{"recipient":["user@example.com"]}' --region ap-south-1

# Make an address receive every alert (admin copy)
aws sns set-subscription-attributes --subscription-arn <sub-arn> `
  --attribute-name FilterPolicy --attribute-value '{}' --region ap-south-1
```

---

## 3. AWS Step-by-Step Configuration Guide

### Step 3.1: Amazon S3 Private Bucket Setup
1. Open the **Amazon S3 Console** and click **Create bucket**.
2. **Bucket Name**: `clouddoc-vault-docs-<account-id>-<region>`
3. **Block Public Access**: Keep **Block all public access** checked (Zero-Trust).
4. **Bucket Encryption**: Enable **Server-side encryption with Amazon S3 managed keys (SSE-S3)**.
5. In bucket **Permissions** > **Cross-origin resource sharing (CORS)**, save the following JSON:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### Step 3.2: Amazon DynamoDB Tables Setup
Create two DynamoDB tables with On-Demand capacity:

1. **Table 1: `ClouddocUsers`**
   - **Partition Key**: `Email` (String)
   - **Global Secondary Index (GSI)**:
     - GSI Name: `UserIDIndex`
     - Partition Key: `UserID` (String)
     - Projection: `ALL`

2. **Table 2: `DocumentsMetadata`**
   - **Partition Key**: `DocumentID` (String)
   - **Global Secondary Index (GSI)**:
     - GSI Name: `OwnerIDIndex`
     - Partition Key: `OwnerID` (String)
     - Projection: `ALL`

### Step 3.3: Amazon SNS Topic Setup (per-user email routing)
1. Open **Amazon SNS** > **Topics** > **Create topic**.
2. **Type**: Standard
3. **Name**: `CloudDocVault_Events`
4. No manual subscription is required. Every user is subscribed automatically:
   - On signup/login, `authHandler` calls `sns:Subscribe` for the user's own email.
   - The subscription carries a **filter policy** on the `recipient` message attribute:
     `{"recipient":["user@example.com"]}`
   - Upload/share alerts are published with `recipient = <that user's email>`, so only that
     user's subscription receives the email.
5. Each user must click the AWS **Subscription Confirmation** email once. The dashboard shows
   an amber banner until the subscription is confirmed (the "Check again" button re-checks it).
6. Optional admin copy of *all* events: create an extra email subscription and **leave it
   without a filter policy**. Note that SNS fan-out means that address will then receive every
   upload/share alert.

> SNS email subscriptions have no recipient field. Filter policies are what make per-user
> routing possible on a single topic.

### Step 3.4: AWS Lambda Functions Setup
Deploy the 6 handlers from the `backend/` directory using Node.js 22.x:
- **authHandler**: `handlers/authHandler.handler`
- **uploadHandler**: `handlers/uploadHandler.handler`
- **getDocumentsHandler**: `handlers/getDocumentsHandler.handler`
- **shareHandler**: `handlers/shareHandler.handler`
- **openHandler**: `handlers/openHandler.handler`
- **deleteHandler**: `handlers/deleteHandler.handler`

### Step 3.5: Amazon API Gateway REST Setup
1. Create a **REST API** named `CloudDocVaultAPI`.
2. Add Resources:
   - `/auth/signup` (POST &rarr; `authHandler`)
   - `/auth/login` (POST &rarr; `authHandler`)
   - `/auth/notifications` (GET &rarr; `authHandler`, returns the user's SNS confirmation state)
   - `/documents` (GET &rarr; `getDocumentsHandler`, POST &rarr; `uploadHandler`)
   - `/documents/share` (POST &rarr; `shareHandler`)
   - `/documents/{documentId}` (DELETE &rarr; `deleteHandler`)
   - `/documents/{documentId}/download` (GET &rarr; `openHandler`)
3. Enable CORS on all resources.
4. Under **API Settings**, add Binary Media Types: `multipart/form-data`, `application/octet-stream`.
5. Deploy API to stage `prod`. Copy Invoke URL to `frontend/.env.local` as `NEXT_PUBLIC_API_URL`.
