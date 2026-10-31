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
│   │   ├── uploadHandler.js            # User-prefix S3 storage, DocumentsMetadata record & SNS alert
│   │   ├── getDocumentsHandler.js      # Retrieves owned + shared docs with storage quota analytics
│   │   └── shareHandler.js             # Generates S3 Pre-Signed URLs (GET/PUT) for target users
│   ├── lib/
│   │   ├── authUtils.js                # PBKDF2 password hashing & zero-dependency JWT engine
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
│   │   └── ShareModal.tsx              # Pre-signed link modal (View, Edit, Write & Expiry)
│   ├── lib/
│   │   ├── api.ts                      # REST client with offline fallback demo mode
│   │   └── types.ts                    # TypeScript data models
│   ├── tailwind.config.ts              # Custom vault palette & dark mode configuration
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.example
└── README.md
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

### Step 3.3: Amazon SNS Topic Setup
1. Open **Amazon SNS** > **Topics** > **Create topic**.
2. **Type**: Standard
3. **Name**: `CloudDocVault_Events`
4. Under **Subscriptions**, click **Create subscription**:
   - **Protocol**: Email
   - **Endpoint**: Enter administrator notification email
   - Check inbox and click **Confirm subscription**.

### Step 3.4: AWS Lambda Functions Setup
Deploy the 4 handlers from the `backend/` directory using Node.js 20.x:
- **authHandler**: `handlers/authHandler.handler`
- **uploadHandler**: `handlers/uploadHandler.handler`
- **getDocumentsHandler**: `handlers/getDocumentsHandler.handler`
- **shareHandler**: `handlers/shareHandler.handler`

### Step 3.5: Amazon API Gateway REST Setup
1. Create a **REST API** named `CloudDocVaultAPI`.
2. Add Resources:
   - `/auth/signup` (POST &rarr; `authHandler`)
   - `/auth/login` (POST &rarr; `authHandler`)
   - `/documents` (GET &rarr; `getDocumentsHandler`, POST &rarr; `uploadHandler`)
   - `/documents/share` (POST &rarr; `shareHandler`)
3. Enable CORS on all resources.
4. Under **API Settings**, add Binary Media Types: `multipart/form-data`, `application/octet-stream`.
5. Deploy API to stage `prod`. Copy Invoke URL to `frontend/.env.local` as `NEXT_PUBLIC_API_URL`.
