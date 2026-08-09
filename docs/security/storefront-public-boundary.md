# Storefront Public Boundary

- Public catalog and checkout do not use employee authentication.
- Tenant identity comes only from server configuration and must resolve to an ACTIVE organization.
- Strict contracts reject unknown fields, including browser-supplied `organizationId`, price, totals, channel, status, role, permissions, and payment records.
- Checkout prices and availability are transaction-fresh server facts.
- Customer PII is written only to existing SalesOrder customer/delivery fields and is not included in audit metadata.
- No public order lookup exposes customer details or internal UUIDs.
- Admin order actions retain existing authentication and authorization.
