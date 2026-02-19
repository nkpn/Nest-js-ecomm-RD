# Homework 09: Files Module (S3 + Presigned Upload)

## Goal
- Upload files to S3 directly from client using presigned URL.
- Keep file metadata in DB.
- Enforce security rules: backend generates `key`, user cannot send arbitrary S3 key.
- Complete upload flow and bind file to domain entities.

## What We Implemented
- `POST /files/presign`
- `POST /files/complete`
- `GET /files/:id`
- `FilesModule` added to `AppModule` so routes are active.

## Presign: Main Logic
- Endpoint is protected by JWT.
- Backend validates input:
  - `contentType`: `image/jpeg | image/png | image/webp`
  - `sizeBytes` must be positive and <= 5MB
  - `kind`: `avatar | product-image`
- Backend checks access rules (role/scope).
- Backend generates key itself (client does not send key):
  - avatar: `users/{userId}/avatars/{uuid}.ext`
  - product image: `products/{productId}/images/{uuid}.ext`
- Backend creates `FileRecord` in DB with status `pending`.
- Backend returns presigned `uploadUrl` for direct `PUT` to S3.
- Backend also returns `publicUrl` for file viewing.

## Complete: Main Logic
- `POST /files/complete` now accepts:
```json
{
  "fileId": "uuid",
  "bindTo": "avatar | product-image",
  "productId": "uuid (required for product-image)"
}
```
- Ownership check: file must belong to current user.
- Status transition: `pending -> ready` (after S3 object existence check).
- Domain binding:
  - `bindTo: avatar` -> set `User.avatarFileId`
  - `bindTo: product-image` -> set `Product.imageFileId`
- Extra safety:
  - For avatar, key must match `users/{currentUserId}/avatars/...`
  - For product image, key must match `products/{productId}/images/...`

## DB/Data Model Changes in Code
- `User` entity: added `avatarFileId` (+ index).
- `Product` entity: added `imageFileId` (+ index).
- `FilesModule`: connected repositories for `FileRecord`, `User`, `Product`.
- Added migration:
  - `src/migrations/1770413000000-AddDomainFileLinks.ts`
  - Adds columns + indexes + foreign keys for domain-file links.

## General Flow (End-to-End)
1. Client logs in and gets JWT.
2. Client calls `POST /files/presign`.
3. Backend validates and creates `pending` FileRecord.
4. Client uploads file directly to S3 using `PUT uploadUrl`.
5. Client calls `POST /files/complete` with bind target.
6. Backend verifies ownership, marks file as `ready`, binds to user/product.
7. Client can read metadata via `GET /files/:id`.

## Important Notes
- Presigned URL must be used before expiration (`expiresInSec`).
- `sizeBytes` sent in presign must exactly match uploaded file size when signature includes `content-length`.
- IAM user used by backend must have S3 permissions (`s3:PutObject`, etc.) on target prefixes.
- Migration is prepared but should be run after all planned code changes are finished.

## File View URL Strategy
- Dev variant:
  - If CDN is not configured, backend builds direct S3 URL:
  - `https://{bucket}.s3.{region}.amazonaws.com/{key}`
- Ideal variant:
  - If `CLOUDFRONT_BASE_URL` is set, backend returns:
  - `{CLOUDFRONT_BASE_URL}/{key}`
- Implemented in `S3Service.buildPublicUrl`.

## Minimal Acceptance Checklist
- [x] Bucket is not public-for-all (must be private + upload via presigned URL).
- [x] `key` is generated only by backend.
- [x] User cannot upload/bind into foreign prefix.
- [x] Metadata is stored in DB with statuses `pending/ready`.
- [x] Integrated with domain entities (`Users` and `Products`).

## Evaluation Checklist Status (Verified Locally)
### Correctness
- [x] `FileRecord` is created as `pending` before upload.
  - Verified by `GET /files/:id` right after `POST /files/presign` -> `status: pending`.
- [x] `complete` changes status to `ready` and binds entity.
  - Avatar flow: `entityId == currentUserId`.
  - Product flow: `entityId == productId` and `Product.imageFileId == fileId`.
- [x] User cannot complete someone else's file.
  - Verified: foreign user `POST /files/complete` -> HTTP `403`.
- [x] `key` is generated only on backend.
  - Verified: passing fake `key` in `presign` body does not affect saved/generated key.

### Security
- [x] Bucket is not globally public.
  - Verified: direct unsigned S3 URL returned HTTP `403`.
- [x] Cannot upload/bind to foreign prefixes/entity target.
  - Avatar: prefix is always `users/{currentUserId}/avatars/...`, and complete checks prefix-owner match.
  - Product: complete checks `products/{productId}/images/...` prefix matches requested `productId`.
- [x] Access is enforced via JWT + roles/scopes.
  - Verified: user without `files:write` gets HTTP `403` on `POST /files/presign`.

### Code Quality
- [x] Separate Files/Storage layer exists.
  - `FilesController` -> `FilesService` -> `S3Service`.
- [x] Logic is explicit and readable.
  - Explicit DTOs (`PresignFileDto`, `CompleteUploadDto`), helper methods for checks and binding.
- [x] Statuses and checks are explicit.
  - `FileStatus.PENDING/READY`, ownership check, prefix checks, entity binding checks.

## What Domain Is Integrated
- Integrated both domains:
  - `Users`: `avatarFileId`
  - `Products`: `imageFileId`

## How presign -> upload -> complete Works
1. Client calls `POST /files/presign` with JWT and file metadata.
2. Backend validates rights/input, generates key, saves DB record with `pending`.
3. Backend returns `uploadUrl` (presigned PUT) and `publicUrl`.
4. Client uploads binary directly to S3 via `PUT uploadUrl`.
5. Client calls `POST /files/complete` with bind target (`avatar` or `product-image`).
6. Backend verifies ownership, checks object exists in S3, sets `ready`, binds file to entity.

## How Access Checks Are Implemented
- JWT required on all `/files/*` endpoints.
- Presign checks:
  - allowed roles (`user|support|admin`)
  - required scope (`files:write`; product-image supports `products:images:write`)
- Complete checks:
  - file must belong to current user
  - binding key prefix must match bind target.

## How View URL Is Built
- Implemented in `S3Service.buildPublicUrl(key)`:
  - if `CLOUDFRONT_BASE_URL` is set -> `${CLOUDFRONT_BASE_URL}/${key}`
  - fallback -> direct S3 URL `https://{bucket}.s3.{region}.amazonaws.com/{key}`
