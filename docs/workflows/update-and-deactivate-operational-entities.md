# Update And Deactivate Operational Entities

1. Load the target branch, stock location, or POS counter.
2. Send the metadata update or status change with `organizationId`, entity ID, and `expectedVersion`.
3. Treat omitted optional metadata fields as unchanged.
4. Send `null` to clear nullable branch contact/address fields.
5. Retry from a fresh read when a concurrency conflict occurs.

Branch deactivation requires no active stock locations and no active POS counters.

Branch archival requires all child stock locations and POS counters to already be archived.

Stock location deactivation and archival force `isSellable = false`. Reactivation leaves it false until an explicit metadata update changes it.

No workflow in this slice changes inventory, sales, users, authentication, pricing, orders, endpoints, or UI.
