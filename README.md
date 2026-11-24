# CloudDoc Vault

**Secure, serverless document storage with time-limited sharing links.**

CloudDoc Vault is a full-stack, zero-trust document vault built with a **Next.js 14** frontend and an **AWS SAM / Lambda** backend. Files are stored privately in S3 under per-user prefixes, metadata lives in DynamoDB, access is enforced with JWTs and short-lived SigV4 pre-signed URLs, and Amazon SNS sends per-user email alerts.

> The app is deployed with the frontend on **Vercel** and the backend already running on **AWS** in `ap-south-1`.

---

## Table of contents

1. [Features](#1-features)
2. [Architecture](#2-architecture)
3. [Tech stack](#3-tech-stack)
4. [Project structure](#4-project-structure)
5. [AWS resources (current deployment)](#5-aws-resources-current-deployment)
6. [API endpoints](#6-api-endpoints)
7. [Security model](#7-security-model)
8. [How the main workflows work](#8-how-the-main-workflows-work)
9. [Local development](#9-local-development)
10. [Deployment](#10-deployment)
11. [Environment variables & secrets](#11-environment-variables--secrets)
12. [Troubleshooting](#12-troubleshooting)
13. [Future scope](#13-future-scope)

---

## 1. Features

- 🔐 **User isolation** — every object is stored at `vault/{userId}/{documentId}/{fileName}`; the bucket blocks all public access and uses SSE-S3 (AES-256).
- 🔑 **JWT authentication** — PBKDF2 password hashing with per-user salts and signed session tokens.
- ⏳ **Ephemeral sharing** — short links that live 15 minutes to 7 days; each successful open issues a fresh view-only S3 GET URL valid for at most 60 seconds, never longer than the link itself.
- 🎯 **Recipient-restricted links** — a link is bound to an existing CloudDoc Vault account; possession of the share code alone is not enough to open it.
- 👁️ **View-only sharing** — the UI only offers read-only access. Edit/Write options were intentionally removed because a pre-signed PUT is a full overwrite, not collaborative editing.
- 📨 **Email notifications** — SNS topic with one filtered subscription per user, so alerts are routed only to the intended recipient.
- 📊 **Dashboard** — storage usage, file-type breakdown, search/filter, share notifications, and dark/light themes.
- 📱 **Fully responsive** — works on phones, tablets, and desktops.
- 🖥️ **Inline preview** — PDFs/images render inline; text-like files (CSV, JSON, XML, etc.) are served as `text/plain` for preview so the browser displays them instead of downloading.

---

## 2. Architecture

```
 Browser (Next.js 14 on Vercel)
        |
        |  REST + Bearer JWT
        v
 API Gateway (REST API, stage /prod)
        |
        +--> AuthFunction          (signup, login, notification status)
        +--> UploadDocumentFunction
        +--> GetDocumentsFunction
        +--> ShareDocumentFunction (creates recipient-bound short links)
        +--> ResolveShareFunction  (verifies recipient, signs short GET URL)
        +--> OpenDocumentFunction
        +--> DeleteDocumentFunction
                 |
     +-----------+-----------+-----------+-----------+
     v           v           v           v           v
   Amazon     DynamoDB    DynamoDB    DynamoDB    Amazon SNS
     S3       Clouddoc    Documents   ShareLinks  CloudDocVault_Events
             Users       Metadata
```

**Storage**

- `ClouddocUsers` — partition key `Email`, GSI `UserIDIndex`; stores password hash, salt, user profile, and SNS subscription state.
- `DocumentsMetadata` — partition key `DocumentID`, GSI `OwnerIDIndex`; stores file metadata, content type, S3 key, and the `SharedWith` permission array.
- `ShareLinks` — partition key `ShareCode`, TTL on `ExpiresAtEpoch`; stores `RecipientUserId` and normalized `RecipientEmail` alongside document ID and expiry.
- S3 — private documents bucket + a separate versioned bucket for SAM artifacts.
- SNS — one topic, per-user filter policies on the `recipient` message attribute.

---

## 3. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, lucide-react |
| Hosting | Vercel (frontend), AWS (backend) |
| API | Amazon API Gateway (REST) |
| Compute | AWS Lambda (Node.js 22.x, arm64, 512 MB) |
| Storage | Amazon S3 (SSE-S3), DynamoDB (on-demand, PITR) |
| Notifications | Amazon SNS |
| IaC / CI | AWS SAM, CloudFormation, npm |

---

## 4. Project structure

```
CloudDoc-Vault/
├── backend/
│   ├── handlers/
│   │   ├── authHandler.js            # signup, login, SNS status
│   │   ├── uploadHandler.js          # base64 -> S3 + metadata + alert
│   │   ├── getDocumentsHandler.js    # owned + shared docs, storage metrics
│   │   ├── shareHandler.js           # creates recipient-bound VIEW share links
│   │   ├── resolveShareHandler.js    # verifies recipient, signs short GET URLs
│   │   ├── openHandler.js            # preview/download GET links
│   │   └── deleteHandler.js          # owner-only delete
│   ├── lib/
│   │   ├── authUtils.js              # PBKDF2 hashing + JWT signing/verification
│   │   ├── awsClients.js             # AWS SDK v3 clients + CORS headers
│   │   ├── notifications.js          # per-user SNS subscriptions/publishes
│   │   └── shareRecipient.js         # recipient lookup + stored-recipient checks
│   ├── test/
│   │   └── shareLinks.test.js        # node:test recipient/expiry tests
│   ├── template.yaml                 # SAM infrastructure definition
│   ├── samconfig.toml                # deploy configuration
│   ├── package.json
│   ├── .env.example                  # template only - no real secrets
│   ├── .npmignore / .samignore       # keep build artifacts out of SAM packaging
│   └── .aws-sam/                     # local build output (gitignored)
├── frontend/
│   ├── app/
│   │   ├── page.tsx                  # landing + dashboard
│   │   ├── s/[code]/page.tsx         # sign-in/resume + share link resolver
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   ├── layout.tsx                # metadata + favicon
│   │   └── globals.css
│   ├── components/                   # Navbar, UploadModal, ShareModal, etc.
│   ├── lib/api.ts                    # REST client (real API only)
│   ├── lib/types.ts                  # TypeScript models
│   ├── public/favicon.svg            # browser tab icon
│   └── .env.example
├── .gitignore                        # ignores .env*, AWS credentials, build output
└── README.md
```

---

## 5. AWS resources (current deployment)

| Resource | Exact value |
|---|---|
| Region | `ap-south-1` |
| Stack | `clouddoc-vault` |
| API Gateway | `https://xxxxxxxxxxxxxx.ap-south-1.amazonaws.com/prod` |
| Documents bucket | `clouddoc-vault-docs-799xxxxxxx-ap-south-1` |
| SAM artifact bucket | `clouddoc-vault-sam-artifacts-799xxxxxxx-ap-south-1` |
| Users table | `ClouddocUsers` |
| Metadata table | `DocumentsMetadata` |
| SNS topic | `arn:aws:sns:ap-south-1:799xxxxxxx:CloudDocVault_Events` |
| CloudWatch logs | `/aws/lambda/clouddoc-vault-*` |

> These identifiers are account-specific. For a new deployment, update `backend/samconfig.toml` and `frontend/.env.local`.

---

## 6. API endpoints

All routes are under the API Gateway base URL. Every route except signup/login/password reset and the CORS preflight requires `Authorization: Bearer <jwt>`.

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/signup` | Create account, hash password, subscribe email to SNS |
| POST | `/auth/login` | Verify credentials, return JWT |
| GET | `/auth/notifications` | Refresh SNS subscription status |
| POST | `/documents` | Upload a document (base64 body) |
| GET | `/documents` | List documents owned by or shared with the user |
| POST | `/documents/share` | Create a VIEW short link bound to an existing recipient account (`recipient`: email or user ID; `expiresIn`: 60–604800 seconds) |
| GET | `/share/{code}` | Verify the signed-in recipient, then return a fresh ≤60-second S3 GET URL |
| GET | `/documents/{id}/download` | Preview (`inline`) or forced download (`?download=1`) |
| DELETE | `/documents/{id}` | Delete an owned document from S3 + DynamoDB |

`GET /share/{code}` returns 401 without a valid token, 403 when the token's user is not the stored recipient (including legacy links with no recipient), 404 for unknown codes, and 410 for expired links.

---

## 7. Security model

- **Private by default** — no public bucket access; all reads/writes go through SigV4 pre-signed URLs generated by Lambda.
- **JWT verification** — every protected handler validates the bearer token before touching data, including the share resolver.
- **Recipient-bound links** — creation resolves the recipient email/user ID to a real account and stores `RecipientUserId` + normalized `RecipientEmail` on the `ShareLinks` record.
- **No code-only access** — the resolver compares the verified token's `userId` with the stored recipient before reading document metadata or signing anything; a different signed-in user gets 403, a signed-out visitor gets 401, and legacy links without recipient details fail closed.
- **Owner checks** — deletion is restricted to `OwnerID`; opening/sharing validates entry in `SharedWith` or ownership.
- **View-only UI** — the share modal only issues GET links. EDIT/WRITE are not exposed in the frontend.
- **Two expiry windows** — the short link lives 15 minutes to 7 days (chosen at share time); each resolution issues a fresh S3 URL capped at 60 seconds and never beyond the link's remaining lifetime.
- **No secrets in git** — `.gitignore` excludes `.env*`, AWS credentials, keys, and build output. Only `.env.example` templates are committed.

---

## 8. How the main workflows work

**Signup / Login** — credentials are sent to `authHandler`; the password is PBKDF2-hashed with a random salt, a JWT is issued, and an SNS subscription is created for the user (confirmed once via email).

**Upload** — the frontend sends base64 file data; Lambda writes the object to S3 with metadata, inserts a DynamoDB record, and publishes an upload alert to the uploader.

**Open / Preview** — `openHandler` creates a 15-minute GET URL. Text-like MIME types are overridden to `text/plain; charset=utf-8` for inline rendering; forced downloads keep the real MIME type.

**Share** — the owner must pick a recipient (existing account email or user ID) and an expiry. Email is normalized (`trim().toLowerCase()`) and looked up in `ClouddocUsers`; user IDs are checked against `UserIDIndex`. Unknown accounts are rejected. `shareHandler` updates `SharedWith`, stores the resolved recipient ID and email on a new `ShareLinks` record, creates `/s/{code}`, and publishes a `DOCUMENT_SHARED` alert to the recipient address. The owner copies the link from the modal.

**Open a shared link** — `/s/[code]` calls `GET /share/{code}` with the login JWT. If the visitor is signed out (401), the page shows a sign-in dialog and retries the same code after login; a signed-in non-recipient (403) can switch accounts. Only after the backend confirms the stored recipient does `resolveShareHandler` generate a view-only S3 GET URL (≤60 seconds, never past the link's expiry) and the page redirects to it.

**Delete** — owner-only; removes both the S3 object and the DynamoDB item.

---

## 9. Local development

```bash
# Frontend
cd frontend
npm install
cp .env.example .env.local      # set NEXT_API_URL
npm run dev

# Backend (local invoke / tests)
cd backend
npm install
npm test                 # node:test share-link authorization tests
# Set environment vars from .env.example in your shell or Lambda config
sam build --no-cached
sam local invoke AuthFunction -e events.json
```

Frontend type checks (also run as part of `npm run build`):

```bash
cd frontend
npm run typecheck
```

Windows note: if `sam build` fails with long-path errors, set the temp dirs first:

```powershell
$env:TEMP='C:\tmp'; $env:TMP='C:\tmp'; sam build --no-cached
```

---

## 10. Deployment

**Backend (AWS SAM)**

```powershell
cd backend
$env:TEMP='C:\tmp'; $env:TMP='C:\tmp'
sam build --no-cached
sam deploy --no-confirm-changeset --no-fail-on-empty-changeset
```

`samconfig.toml` already holds the stack name, artifact bucket, region, and `CAPABILITY_IAM` (Lambda roles are created automatically from the SAM `Policies:` blocks).

**Frontend (Vercel)**

1. Import `Khan-ebadat/CloudDoc-Vault` into Vercel.
2. Set **Root Directory** to `frontend`.
3. Add environment variable:
   ```
   NEXT_API_URL=https://5sdkgk80ul.execute-api.ap-south-1.amazonaws.com/prod
   ```
4. Deploy. Vercel auto-redeploys on every push to `main`.

---

## 11. Environment variables & secrets

| File | Committed? | Contents |
|---|---|---|
| `backend/.env.example` | ✅ Yes | Placeholder variable names only |
| `frontend/.env.example` | ✅ Yes | Public API URL |
| `backend/.env` | ❌ Never | Real JWT secret, table/bucket names |
| `frontend/.env.local` | ❌ Never | Real `NEXT_API_URL` |
| `~/.aws/credentials` | ❌ Never | AWS CLI access keys (outside the repo) |

If a secret is ever committed, rotate it immediately (generate a new JWT secret and new AWS access keys) and purge it from history.

---

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| `NEXT_API_URL is not configured` | Add the env var in Vercel **before** building, then redeploy. |
| `401 Unauthorized` | JWT missing/expired — sign in again; share links always require a signed-in user. |
| `sam build` long-path error on Windows | Use `C:\tmp` for `TEMP`/`TMP` and keep `backend/.npmignore`. |
| CSV/JSON downloads instead of opening | Expected for browsers without a renderer — preview now serves them as `text/plain`. |
| SNS alert not received | Click the AWS subscription confirmation email; check the dashboard banner. |
| Share creation says "Recipient account not found" | The email/user ID must belong to an existing CloudDoc Vault account; ask the recipient to sign up first. |
| Shared link 403 | You are not the stored recipient (or the link predates recipient tracking) — sign in as the recipient or ask the owner to re-share. |
| Shared link 410 | The link expired; ask the owner to create a new one. |

---

## 13. Future scope

- In-browser preview for DOCX/XLSX/PPTX via an external viewer.
- S3 versioning and restore for overwritten files.
- Link revocation and configurable per-link permissions.
- Audit log dashboard for all open/share/delete events.
- Resumable uploads for large files.
- Replace account-ID-derived JWT secret with a dedicated Secrets Manager value.

---

*Built with Next.js 14, AWS SAM, S3, DynamoDB, SNS, and a lot of coffee.*
