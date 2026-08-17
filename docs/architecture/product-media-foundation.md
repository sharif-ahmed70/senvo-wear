# Product Media Foundation

## Scope

The first media slice lets authorized catalog staff upload, replace, remove,
and read one primary image per product. Admin and Storefront consume safe media
projections through the existing HTTP, API, and application boundaries.

## Ownership

`MediaAsset` stores organization ownership, a server-generated object key,
content metadata, alt text, lifecycle, idempotency data, and timestamps.
`CatalogMediaLink` associates an asset with an organization-owned product and a
role. The schema is capable of future gallery roles, but only `PRIMARY` is
exposed. A partial unique index permits at most one active primary per product.

Organization-safe composite foreign keys prevent cross-tenant asset/product
links. Repositories always filter by organization and inactive links or assets
are excluded from Admin and Storefront read projections.

## Write Flow

1. The API validates a strict contract and establishes trusted context.
2. The application authorizes `CATALOG.UPDATE`, validates MIME, size, alt text,
   and practical image signatures, then generates the storage key.
3. The provider uploads the bytes.
4. One explicit database transaction locks the product media namespace,
   archives the prior primary, and creates the new asset/link.
5. Archived object cleanup runs after database commit.

The object store and PostgreSQL cannot share a transaction. A database failure
therefore triggers best-effort deletion of the newly uploaded object. A failure
to delete an archived object never reverses correct database truth; later media
writes retry archived-object cleanup. Concurrent idempotent retries converge on
one database asset and delete the unused uploaded object.

## Reads

PostgreSQL stores object keys, never temporary provider URLs. The application
asks the injected storage provider for a safe URL while constructing a media
projection. Storefront receives only active organization-owned media attached
to products already accepted by the public catalog query.

## Runtime

Tests use the in-memory provider. Local development may use the filesystem
provider rooted at `MEDIA_STORAGE_ROOT`. Production composition must inject an
explicit provider and will not silently use local disk.

## Deferred

Multiple-image galleries, variant imagery, ordering, publish scheduling,
malware scanning, production cloud storage, transformations, and CDN policy are
outside this milestone.
