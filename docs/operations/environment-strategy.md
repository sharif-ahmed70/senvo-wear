# Environment Strategy

Environment variables are documented through `.env.example` files. Real values belong in untracked local files or deployment secret stores.

Current foundation variables:

- `DATABASE_URL`: PostgreSQL datasource for Prisma.
- `APP_ENV`: server-side environment label. `staging` and `production` require explicit runtime database configuration.
- `NEXT_PUBLIC_APP_ENV`: public, non-secret app environment label.

Production URLs, credentials, payment keys, and courier keys are intentionally absent.

Prisma `validate` and `generate` may use an invalid placeholder URL when no `DATABASE_URL` is configured outside staging/production. Runtime database access and migration commands never use this placeholder.
