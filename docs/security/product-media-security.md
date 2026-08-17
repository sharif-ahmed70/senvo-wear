# Product Media Security

## Trusted Context

The browser supplies path-scoped product/link IDs, bounded image content,
declared MIME, alt text, optional variant association, ordering, and an
idempotency key. It cannot supply `organizationId`, actor identity,
permissions, an object key, bucket, or provider URL. Organization and actor
facts come from authenticated server execution context. Backend
`CATALOG.READ`/`CATALOG.UPDATE` authorization remains authoritative.

## Tenant Isolation

Repository reads include organization scope. Composite database foreign keys
require each media asset, catalog link, and product to share an organization.
Variant links additionally require the variant to share the exact product and
organization. Complete reorder validation and transaction-scoped advisory
locks prevent partial or cross-product reorder writes.
Cross-tenant requests follow organization-scoped not-found behavior and do not
reveal whether another tenant owns an asset or product.

Object keys are generated server-side as organization/product/asset paths from
validated UUIDs. Local filesystem resolution rejects paths outside its root.

## Input and Output

Accepted content is limited to JPEG, PNG, or WebP and 5 MB. The application
checks practical magic bytes instead of trusting the browser MIME alone. Alt
text is required and bounded. HTTP applies a bounded JSON envelope before API
or application execution.

Responses expose an asset ID, content metadata, alt text, and provider-resolved
URL. They do not expose storage keys, credentials, raw provider errors, or stack
traces. Standard safe errors retain the request ID. Binary bodies, signed URLs,
and secrets must not be logged.

Storefront media is only resolved after the existing public product lifecycle
query accepts an ACTIVE product with an ACTIVE category. Both media asset and
link must also be ACTIVE; archived media is excluded.

## Remaining Hardening

A production adapter must define private-object access, signed URL lifetime,
malware scanning, image decoding, transformation, and CDN controls. Those
controls are not implied by the local-development adapter.
