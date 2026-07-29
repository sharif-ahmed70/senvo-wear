# Admin Catalog Module

## Scope

The admin catalog module is the first business feature in the admin
application. It manages categories, collections, products, and product
variants without importing domain or database packages into the UI.

## Request Flow

```text
Admin catalog page
  -> AdminApiClient
  -> Node HTTP adapter
  -> protected catalog API handler
  -> CatalogApplicationService
  -> catalog domain use case
  -> organization-scoped Prisma repository
```

The API handler validates strict service contracts, authenticates the request,
and requires `CATALOG.READ`, `CATALOG.CREATE`, or `CATALOG.UPDATE`. The
organization identifier comes only from the trusted application context.
Client payloads cannot choose an organization.

## Admin Routes

- `/catalog/categories` lists and creates categories and exposes status changes.
- `/catalog/collections` lists and creates collections.
- `/catalog/products` lists and creates products and can create an initial
  variant.

Each route includes loading, empty, error, and populated states. Product input
collects name, product code, category, optional collection, and optional SKU,
color, and size identifiers. Client validation improves feedback only; all
authoritative validation remains behind the API boundary.

## Data Access

Catalog management repository contracts are separate from the original
create-focused repository contracts. This keeps domain use-case dependencies
small while providing organization-scoped list, detail, status, collection
assignment, and variant operations to the application layer.

Current list operations are deliberately capped at 100 records. Cursor
pagination and richer filtering remain future work.

## Security

Permission-aware UI controls hide unavailable actions, but do not grant access.
Every protected API operation authenticates and authorizes independently.
Scoped repository queries include `organizationId`, and cross-organization
lookups return not found.

## Runtime Configuration

`NEXT_PUBLIC_SENVO_API_URL` may provide the HTTP API base URL. The admin client
uses standard response envelopes and request IDs for success and error
correlation.
