# ADR-102: Product Media Ownership Boundary

## Status

Accepted.

## Decision

Product media is modeled as organization-owned `MediaAsset` records linked to
canonical catalog products through `CatalogMediaLink`. PostgreSQL stores stable
object keys and lifecycle metadata; an injected `ObjectStorageProvider` owns
binary persistence and URL resolution. Clients never choose storage ownership
or object namespaces.

One active `PRIMARY` link remains canonical while active `GALLERY` links
provide ordered product and variant imagery. Optional variant links use a
composite variant/product/organization foreign key, so a link cannot cross a
tenant or product boundary. Uploads
precede the explicit database transaction and use compensating cleanup because
the object store and PostgreSQL cannot commit atomically.

## Consequences

Default projections place PRIMARY first, then product-level gallery images by
`sortOrder`, `createdAt`, and link ID. Variant selection uses that variant's
ordered images when present and otherwise falls back to product-level media.
Failed cleanup may leave a non-public object for a
retryable cleanup pass, while committed catalog truth remains authoritative.
