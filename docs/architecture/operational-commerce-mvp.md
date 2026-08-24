# Operational Commerce MVP

## Scope

The operational commerce slice adds organization-scoped customers, vendors,
purchase receiving, vendor payments, governed product cost/selling prices, and
day-to-day dashboard metrics. It reuses the existing catalog, inventory ledger,
POS, sales order, payment, receipt, authorization, transaction, and audit
boundaries.

## Ownership and isolation

- Customer and vendor records belong to exactly one organization.
- Browser contracts never accept organization identity, actor identity, role,
  or permissions. The validated application execution context supplies them.
- Sales orders reference customers with a restrictive tenant-composite foreign
  key while retaining immutable customer snapshots on orders and receipts.
- Customer and vendor lifecycle is status based. Historical parties are not
  hard deleted.

## Purchase receiving

Purchase receiving runs inside one explicit outer transaction. It validates the
active vendor, destination, and variants; posts an inventory receipt movement;
records purchase lines and an optional initial payment; updates latest variant
cost; and appends audit. An organization-scoped idempotency key prevents
duplicate stock. Stock quantity is never edited directly.

## POS and reporting

The server resolves an optional active customer in the trusted organization,
validates discount against server-priced cart totals, and includes both in the
checkout idempotency signature. Operational reports derive sales, collections,
returns/refunds, stock value, estimated cost-based profit, customer due, and
vendor payable from authoritative PostgreSQL records.

## Deferred

Purchase drafts/approvals, purchase returns, accounting journals, tax, loyalty,
customer segmentation, dedicated hardware drivers, and advanced BI remain out
of scope. USB scanners use keyboard input and thermal printers use browser
print output.
