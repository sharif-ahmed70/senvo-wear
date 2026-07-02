# Read and List Operational Entities

Use get-by-id when the caller already has an entity id. The application query requires both the organization id and entity id. If the row is missing or belongs to another organization, the result is the stable not-found error.

Use list queries for browsing operational setup records. Every list query is organization-scoped and cursor-paginated. The first request may omit the cursor. If the response has `hasMore: true`, pass `nextCursor` into the next request. If `nextCursor` is null, there is no next page.

Default list behavior shows active and inactive records. Archived records are intentionally hidden from default browsing but can be inspected by explicitly filtering `status` to `ARCHIVED`.

Search is basic operational lookup by name or code. Blank search input is treated as omitted. Advanced search and ranking are deferred until a measured need exists.
