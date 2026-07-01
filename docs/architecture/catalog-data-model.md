# Catalog Data Model

Models added:

- `Organization`
- `Category`
- `Collection`
- `Color`
- `Size`
- `Product`
- `ProductVariant`
- `ProductCollection`

Category slugs are unique organization-wide. Collection slugs, product slugs, product codes, color codes, size codes, and variant SKUs are also scoped to organization.

Product variants are unique by `productId + colorId + sizeId`. Product, category, color, size, collection, and variant references use composite foreign keys with `organizationId` where needed to prevent cross-organization references.

Referential actions use restrictive deletes. This avoids accidental erasure of business history once dependent records exist. Archive/deactivation workflows are future work.

The database foreign keys prevent missing and cross-organization parents, but they do not prevent deeper category cycles such as `A -> B -> C -> A`. The initial create use case prevents direct self-parenting and cross-organization parent references. A future category parent-change use case must load the full ancestor chain transactionally and use the domain cycle assertion before changing `parentId`; direct database writes outside that service could otherwise create deeper cycles.
