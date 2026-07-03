# Amend Draft Sales Order

1. Read the draft sales order and capture its current `version`.
2. Submit either a metadata update, a complete replacement line set, or both through the combined amendment command.
3. Include `organizationId`, `salesOrderId`, and `expectedVersion`.
4. The application validates IDs, contact bounds, money, duplicate variants, and at least one requested change.
5. The repository locks the organization-scoped order row.
6. The repository rejects missing, non-draft, or stale orders.
7. If `allocationPolicyId` is assigned, the repository confirms the policy belongs to the same organization and is active.
8. If lines are replaced, the repository reloads current catalog data and rejects archived or missing variants.
9. The repository deletes old draft lines, inserts the complete new line set, recomputes totals, updates metadata, and increments version once in the same transaction.
10. The caller receives the amended order with refreshed lines, totals, `updatedAt`, and version.

Retries should re-read the order after a concurrency conflict. Amendment commands do not use separate idempotency keys because optimistic concurrency provides a clearer edit contract for mutable draft state.
