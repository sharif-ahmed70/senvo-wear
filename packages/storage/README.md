# Storage Package

`@senvo/storage` owns the provider-neutral object-storage contract and the
server-generated product-media key convention.

Available adapters:

- `InMemoryObjectStorageProvider` for focused tests.
- `LocalFileObjectStorageProvider` for local development. Its root defaults to
  `.senvo-media` and can be changed with `MEDIA_STORAGE_ROOT`.
- `S3CompatibleObjectStorageProvider` for production S3-compatible storage.
  Upload and delete requests use server-side AWS Signature V4 credentials while
  public reads use the separately configured media origin.

Application composition requires an explicitly injected provider in production.
No credentials or bucket names are committed here. The application layer owns
image allowlisting, byte limits, content-signature
checks, idempotency, and database/storage compensation. Malware scanning,
private-object signed URL policy, CDN behavior, and image transformation remain
future hardening work.
