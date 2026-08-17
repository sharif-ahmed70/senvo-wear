# Storefront Public Boundary

- Public catalog and checkout do not use employee authentication.
- Tenant identity comes only from server configuration and must resolve to an ACTIVE organization.
- Strict contracts reject unknown fields, including browser-supplied `organizationId`, price, totals, channel, status, role, permissions, and payment records.
- Checkout prices and availability are transaction-fresh server facts. Browser-reviewed prices are compared with those facts and never become authoritative.
- The persisted guest cart stores only variant IDs and quantities. Hydrated names, product details, availability, and prices are current public read data and are not trusted browser state.
- Missing `NEXT_PUBLIC_SENVO_API_URL` fails the browser request clearly instead of silently targeting localhost.
- Customer PII is written only to existing SalesOrder customer/delivery fields and is not included in audit metadata.
- No public order lookup exposes customer details or internal UUIDs.
- Admin order actions retain existing authentication and authorization.
