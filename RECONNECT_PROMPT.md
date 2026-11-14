# CloudDoc Vault — Reconnect / Redeploy Prompt

Paste everything inside the block below into a fresh AI coding session that has
terminal + AWS CLI access. It is written to be self-contained.

---

```text
You are reconnecting and redeploying an existing project called CloudDoc Vault.
The AWS resources were intentionally torn down, but the source code is intact.

## Project location
C:\Users\HP\Desktop\CloudDoc-Vault
  backend/   -> AWS SAM app (Node.js 22.x, ESM, arm64)
  frontend/  -> Next.js 14 App Router (TypeScript, Tailwind)

## Target AWS environment
Account: 799517333955
Region:  ap-south-1 (Mumbai)
Stack:   clouddoc-vault
API:     REST API (API Gateway), stage prod

## Architecture to recreate (all defined in backend/template.yaml)
- S3 bucket: clouddoc-vault-docs-${AccountId}-${Region}
  private, SSE-S3 (AES256), public access blocked, CORS enabled
  object layout: vault/{userId}/{documentId}/{fileName}
- DynamoDB ClouddocUsers        (PK Email, GSI UserIDIndex on UserID)
- DynamoDB DocumentsMetadata    (PK DocumentID, GSI OwnerIDIndex on OwnerID)
- SNS topic CloudDocVault_Events (per-user filtered email subscriptions)
- 6 Lambda functions (nodejs22.x, arm64, 512 MB, 30 s):
  AuthFunction           handlers/authHandler.handler
  UploadDocumentFunction handlers/uploadHandler.handler
  GetDocumentsFunction   handlers/getDocumentsHandler.handler
  ShareDocumentFunction  handlers/shareHandler.handler
  OpenDocumentFunction   handlers/openHandler.handler
  DeleteDocumentFunction handlers/deleteHandler.handler
- API Gateway REST routes:
  POST /auth/signup            -> authHandler
  POST /auth/login             -> authHandler
  GET  /auth/notifications     -> authHandler
  GET  /documents              -> getDocumentsHandler
  POST /documents              -> uploadHandler
  POST /documents/share        -> shareHandler
  DELETE /documents/{documentId}            -> deleteHandler
  GET  /documents/{documentId}/download     -> openHandler
- Frontend env: frontend/.env.local
  NEXT_PUBLIC_API_URL=<ApiEndpoint output>

## Notification model (important)
SNS Publish has no recipient field. Per-user routing works like this:
- On signup/login, authHandler calls sns:Subscribe for the user's own email with
  FilterPolicy {"recipient":["<email>"]}, FilterPolicyScope MessageAttributes.
- uploadHandler publishes DOCUMENT_UPLOADED with message attribute
  recipient = uploader email.
- shareHandler publishes DOCUMENT_SHARED with message attribute
  recipient = recipient email.
- Each user must click the AWS "Subscription Confirmation" email once.
- GET /auth/notifications returns { email, status } where status is
  PENDING | CONFIRMED | DISABLED | UNKNOWN | ERROR.
- The user record stores NotificationEmail, NotificationStatus,
  NotificationSubscriptionArn.

## Preflight (do these first, stop and report if any fail)
1. `node --version` (>= 20), `npm --version`
2. `sam --version`
3. `aws sts get-caller-identity` -> must return account 799517333955
4. `aws configure get region` -> ap-south-1
5. Confirm backend/samconfig.toml points at:
   stack_name = "clouddoc-vault", region = "ap-south-1",
   s3_bucket = "clouddoc-vault-sam-artifacts-799517333955-ap-south-1",
   s3_prefix = "clouddoc-vault", capabilities = "CAPABILITY_IAM"
6. Confirm no secrets are committed (no .csv access keys, no .env with keys).

## Deploy steps
1. Backend build (from backend/):
   `sam validate --lint --region ap-south-1`
   `sam build`
   If build fails with a missing file under .aws-sam/deps or
   node_modules/@aws-sdk/... then delete .aws-sam and run `sam build` again.
2. Deploy:
   `sam deploy --no-confirm-changeset --no-fail-on-empty-changeset`
   The SAM artifacts bucket must exist first. If it does not:
   `aws s3 mb s3://clouddoc-vault-sam-artifacts-799517333955-ap-south-1 --region ap-south-1`
3. Read the stack outputs:
   `aws cloudformation describe-stacks --stack-name clouddoc-vault --region ap-south-1 --query "Stacks[0].Outputs"`
   Required outputs: ApiEndpoint, S3BucketName, UsersTableName,
   DocumentsTableName, SnsTopicArn.
4. Update frontend/.env.local with the new ApiEndpoint, then:
   `cd frontend && npm install && npx tsc --noEmit && npm run build`
5. Do NOT start a dev server unless asked.

## Verification (must all pass before you report success)
Create a throwaway user and exercise the API with curl or PowerShell:
1. POST /auth/signup {email,password,fullName} -> 201 + token
2. POST /auth/login -> 200 + token
3. GET /auth/notifications with Bearer token -> 200, status PENDING (SNS
   confirmation email is sent to that address)
4. POST /documents with {fileName,fileContentBase64,contentType,fileSize}
   -> 201, S3 object exists under vault/{userId}/{documentId}/...
5. GET /documents -> 200, document present, metrics returned
6. GET /documents/{id}/download -> 200 + pre-signed URL that downloads
7. POST /documents/share {documentId,permission:"VIEW",targetUserId:"<email>"}
   -> 200, SharedWith entry contains email + sharedByName
8. Log in as the recipient, GET /documents -> shared doc visible,
   GET /documents/{id}/download -> 200
9. Anonymous GET /documents -> 401
10. Stranger GET /documents/{id}/download -> 403
11. Non-owner DELETE /documents/{id} -> 403
12. Owner DELETE /documents/{id} -> 200; verify the S3 object is 404 and the
    DocumentsMetadata row is gone.
13. CloudWatch: check the two most recent Lambda log groups show
    "[SNS] Upload notification ... published" and
    "[SNS] Share notification ... published".
Clean up test users/documents you created.

## Security requirements
- Never store AWS credentials or .csv key files in the S3 bucket.
- JWT_SECRET is currently `vault_secret_${AWS::AccountId}` in template.yaml.
  Move it to AWS Secrets Manager and reference it from the Lambdas.
- IAM access keys used for deployment should be rotated, not reused.
- Keep S3 public access fully blocked.

## Guardrails
- This is a destructive-adjacent task: never delete the stack, tables, bucket,
  or data unless the user explicitly asks in this session.
- Ask before any `delete-stack`, `delete-table`, `s3 rm --recursive`, or IAM key
  change.
- If a step fails, stop and report the exact error plus the command that failed.
- Report at the end: stack outputs, every verification result, and anything that
  still needs a human (e.g. clicking an SNS confirmation email).

## Definition of done
- Stack status UPDATE_COMPLETE/CREATE_COMPLETE in ap-south-1
- Frontend build passes and .env.local points at the live API
- All 13 verification checks pass
- No credentials committed or stored in S3
```
