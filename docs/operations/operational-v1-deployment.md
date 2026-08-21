# Operational V1 Deployment

Build and run the API with `@senvo/api-runtime`. Required production values:

- `DATABASE_URL`
- `PORT`
- `SENVO_ALLOWED_ORIGINS` with exact Admin/Storefront origins
- `NEXT_PUBLIC_SENVO_API_URL` in browser builds
- `NEXT_PUBLIC_SENVO_ADMIN_URL` for the POS entry redirect
- `STOREFRONT_ORGANIZATION_CODE`
- `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, and `MEDIA_S3_BUCKET`
- `MEDIA_S3_ACCESS_KEY_ID` and `MEDIA_S3_SECRET_ACCESS_KEY`
- `MEDIA_PUBLIC_BASE_URL`

The media bucket/API endpoint must be HTTPS. Write credentials remain
server-only; public product image reads use `MEDIA_PUBLIC_BASE_URL`.

Before first login, provision an active PASSWORD credential whose identifier is
the user's normalized email and whose hash uses `ScryptPasswordHasher`.
The user, organization, and membership must all be active.

Keep `SSLCOMMERZ_ENABLED=false` for this release until external sandbox
callbacks and credentials are verified. No courier configuration is required.
