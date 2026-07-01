# API Contract Standard

SENVO Wear APIs use discriminated response contracts from `@senvo/contracts`.

Success responses contain `success: true`, `data`, optional `meta`, and a required `requestId`. Failure responses contain `success: false`, a stable machine-readable error code, a safe public message, optional field errors, optional sanitized details, and a required `requestId`.

Error codes use `CATEGORY.SPECIFIC_REASON`. Initial categories are `VALIDATION`, `AUTHENTICATION`, `AUTHORIZATION`, `NOT_FOUND`, `CONFLICT`, `BUSINESS_RULE`, `CONCURRENCY`, `RATE_LIMIT`, `INTEGRATION`, and `INTERNAL`.

Pagination uses one-based `page`, bounded `pageSize`, and optional `totalCount` and `totalPages`. Sorting uses explicit `{ field, direction }` objects. Filters use named fields with primitive values or string arrays; implicit SQL-like filter strings are not allowed.

Dates and timestamps in API payloads use ISO 8601 strings. Money is transported as integer minor units with ISO 4217 currency codes, for example `{ amountMinor: 12500, currency: "BDT" }`.

Internal IDs may be exposed in APIs when required. Human-readable business codes are separate from primary identifiers. Idempotent mutation endpoints must eventually accept an `Idempotency-Key` header and always return or log a request/correlation ID.

HTTP APIs are used for browser, external, and cross-application boundaries. Direct server-side application-service calls may be used inside the monolith when no transport boundary is needed.

API versioning starts with path or route-group versioning when public compatibility is required. No public versioned endpoints exist yet.
