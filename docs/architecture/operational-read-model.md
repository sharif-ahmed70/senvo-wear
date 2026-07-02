# Operational Read Model

SENVO Wear exposes focused read queries for approved operational entities:

- Branch
- Stock Location
- POS Counter

The read model is organization-scoped. Every get and list query requires `organizationId`, and repositories map that value into the database predicate. Cross-organization get attempts return the same not-found behavior as missing records.

Lists are cursor-paginated and bounded. The default page size is 25 and the maximum is 100. Ordering is deterministic by `createdAt` ascending and then `id` ascending, so equal timestamps remain stable across pages.

When no status filter is supplied, list queries include `ACTIVE` and `INACTIVE` records and exclude `ARCHIVED`. Archived records are returned only when `status: "ARCHIVED"` is requested. Get-by-id still returns archived records when the organization and id match.

Search is intentionally simple:

- input is trimmed
- blank search is ignored
- name and code are matched
- PostgreSQL case-insensitive matching is used through Prisma

Advanced ranking, fuzzy matching, full-text search, trigram indexes, Elasticsearch, and total-count analytics are deferred.

The current schema already has organization-scoped indexes for status, type, branch, and unique organization-code access patterns. This read slice adds no migration. If future production volume shows pressure on organization-scoped chronological scans, add narrowly targeted read indexes after measuring the query plan.
