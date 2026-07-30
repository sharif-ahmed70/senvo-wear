# Catalog Attributes

## Scope

Catalog colors and sizes are organization-owned reference records used by
product variants. The admin module supports listing, creation, and active or
inactive lifecycle changes. Records are retained; this module does not expose
delete operations.

## Request Flow

```text
Admin color or size page
  -> AdminApiClient
  -> HTTP catalog route
  -> protected catalog API handler
  -> CatalogApplicationService
  -> catalog domain creation rule
  -> organization-scoped repository
```

The application context supplies the organization identifier. Browser payloads
contain attribute values and record identifiers only, so callers cannot choose
another organization's scope.

## Rules

Color codes and size codes are normalized to uppercase by existing catalog
domain use cases. Codes are unique within an organization. Color hex values
must use `#RRGGBB`; size sort order must be a nonnegative integer.

The product creation workspace reads active colors and sizes through the typed
API client and renders them as dropdown options. Product variants continue to
store stable color and size identifiers. Client validation and option
visibility improve usability but are not authoritative.

## Security

List operations require `CATALOG.READ`, creation requires `CATALOG.CREATE`,
and lifecycle changes require `CATALOG.UPDATE`. The HTTP and API layers do not
access Prisma. Repository reads and updates always include organization scope,
and a cross-organization identifier is treated as not found.

## Current Limits

Attribute lists are capped at 100 records, matching the current catalog
management foundation. Editing names, codes, hex values, or sort order and
deleting attributes are outside this task.
