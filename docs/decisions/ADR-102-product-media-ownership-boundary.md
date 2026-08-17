# ADR-102: Product Media Ownership Boundary

## Status

Accepted.

## Decision

Product media is modeled as organization-owned `MediaAsset` records linked to
canonical catalog products through `CatalogMediaLink`. PostgreSQL stores stable
object keys and lifecycle metadata; an injected `ObjectStorageProvider` owns
binary persistence and URL resolution. Clients never choose storage ownership
or object namespaces.

Only one active `PRIMARY` link per product is supported in this slice. Uploads
precede the explicit database transaction and use compensating cleanup because
the object store and PostgreSQL cannot commit atomically.

## Consequences

The model can later support galleries and variant links without coupling
products to provider URLs. Failed cleanup may leave a non-public object for a
retryable cleanup pass, while committed catalog truth remains authoritative.
