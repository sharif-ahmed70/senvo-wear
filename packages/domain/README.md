# Domain Package

`@senvo/domain` will contain business-domain language and rules for SENVO Wear. It must remain independent from UI, database clients, framework runtime code, and transport DTO assumptions.

Future modules are expected for identity, organization, catalog, pricing, inventory, procurement, sales, orders, payments, after-sales, customers, finance, marketing, analytics, audit, and settings.

Dependency rules:

- May depend on generic utilities when needed.
- Must not import Next.js, React, Prisma Client, storage providers, or logger transports.
- Must not expose database models as the domain model by default.
- Must not contain UI components or API route handlers.

Only neutral foundation types exist in this bootstrap.
