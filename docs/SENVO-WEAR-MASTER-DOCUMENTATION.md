# SENVO Wear ERP Platform

## Architecture, Design Decisions, Development Journey, and Future Roadmap

- **Document type:** Technical whitepaper and project record
- **System snapshot:** August 2026, Storefront Commerce MVP correction head
- **Audience:** Developers, architects, AI assistants, operators, investors, and business stakeholders

This document describes the repository as it exists at the stated snapshot. Earlier milestone documents may describe narrower historical scopes; the current source, migrations, ADRs, tests, and this document take precedence when assessing present capability.

## 1. Executive Summary

SENVO Wear is a custom enterprise resource planning and omnichannel commerce platform for a clothing business. It connects product identity, inventory, stores, temporary sales booths, staff access, sales orders, point-of-sale operations, payment records, returns, refunds, receipts, and a public guest storefront in one organization-scoped system.

The platform addresses a common operational problem: stock, sales, staff activity, and customer orders become fragmented when online commerce, permanent stores, and temporary event booths use separate tools or spreadsheets. SENVO Wear establishes shared business records and rules so that every channel works from the same catalog, inventory ledger, order history, and security model.

Primary users are:

- business owners and administrators managing organizations, stores, staff, roles, and catalog data;
- managers overseeing inventory, sales, booths, and operational history;
- store and event staff using guided POS selling workflows;
- public customers browsing products and placing cash-on-delivery orders;
- developers and operators extending and maintaining the platform.

The core objectives are trustworthy inventory, organization isolation, server-authoritative commerce, durable transaction history, replaceable delivery adapters, and incremental growth from a modular monolith into a complete commerce platform.

The current maturity is a **pre-production, architecture-led commerce MVP**. The repository has substantial domain, database, API, Admin, POS, payment-recording, return/refund, and Storefront foundations with strong automated verification. It is not yet a complete production service: production authentication, deployment, online payment gateway integration, courier integration, customer accounts, analytics, and hardware drivers remain future work.

## 2. Business Background

SENVO Wear operates as a clothing commerce ecosystem rather than a single website. A product can be prepared in a central catalog, stocked at several locations, sold in a showroom, carried to an event booth, or offered online. The same variant identity must remain recognizable across all these contexts.

### 2.1 Operational pressures

Clothing operations create several linked challenges:

- products have categories, collections, colors, sizes, variants, SKUs, and barcodes;
- stock must be traced across stores, holds, transit, and event locations;
- reservations must prevent online and offline channels from promising the same stock;
- temporary booths need historical identity even after an event ends;
- staff access must be limited to the correct organization and role;
- checkout prices, totals, payment status, returns, and refunds must remain historically explainable;
- online guests need a simple buying experience without being trusted as a source of prices or identity.

### 2.2 Why a custom ERP

Generic retail systems frequently assume one sales channel, an editable stock-balance table, fixed store structures, vendor-owned data models, or payment-centric workflows. SENVO Wear needs tighter control over Bangladesh-focused clothing operations, BDT minor-unit money, event booths, organization isolation, inventory reservations, append-only adjustments, and future local hardware such as barcode scanners and Xprinter devices.

A custom platform also permits business rules to live in a stable domain and application layer rather than in UI screens or vendor workflows. This raises initial engineering cost, but it protects historical integrity and makes Admin, POS, Storefront, future mobile clients, and external adapters share the same rules.

## 3. System Vision

The long-term vision is to evolve from a small clothing operation into a complete omnichannel commerce platform without replacing the core every time a new channel is added.

The target system includes:

- **Admin management:** catalog, stores, team, roles, inventory, sales, payments, returns, and configuration;
- **inventory intelligence:** ledger-derived on-hand, reservations, available-to-sell, deterministic allocation, replenishment, and forecasting;
- **POS:** cashier sessions, barcode-assisted carts, server-priced checkout, payment collection, returns, refunds, receipts, and hardware adapters;
- **Storefront:** public discovery, guest and account checkout, payment options, delivery, order tracking, and customer support;
- **customer experience:** profiles, address books, communication preferences, loyalty, and service history;
- **analytics:** channel, store, booth, product, stock, margin, payment, and staff performance;
- **hardware integration:** scanners, label printers, receipt printers, and cash-drawer adapters behind replaceable infrastructure boundaries.

The architectural strategy is to keep one modular monolith while the business and team are small, enforce module boundaries inside the monorepo, and extract services only when operational evidence justifies the cost.

## 4. Complete Development Timeline

The sequence below follows the repository's migration, ADR, and commit history. Each milestone added a bounded capability and its own tests instead of building a large coupled application in one step.

### 4.1 Technical baseline

The project began with a pnpm/Turborepo monorepo, Node.js and TypeScript standards, Next.js application boundaries, PostgreSQL/Prisma infrastructure, environment policy, error contracts, migration verification, and CI. Early corrections aligned migration encoding, workspace dependency preparation, Prisma 7 CLI behavior, and drift verification. These changes established repeatable clean-machine builds before business features were added.

### 4.2 Foundation layer

#### Organization foundation

- **Purpose:** establish the tenant and operational structure.
- **Problem solved:** stores, stock locations, and counters need stable identity and lifecycle rules.
- **Decision:** organization-scoped models use restrictive relations, immutable operational codes, status transitions, versions, and composite tenant keys.
- **Features:** organizations, branches/stores, stock locations, POS counter configuration, lifecycle management, and read queries.
- **Security/database/tests:** tenant-aware repository filters, optimistic concurrency, restrictive deletion, additive migrations, lifecycle and isolation tests.

#### Identity

- **Purpose:** represent people independently from organization access.
- **Problem solved:** one user may belong to multiple organizations with different roles.
- **Decision:** globally unique users are separated from organization memberships.
- **Features:** user lifecycle, membership lifecycle, role assignment, and access validation.
- **Security/database/tests:** inactive or locked users and inactive memberships are rejected; duplicate memberships and cross-organization access are tested.

#### Authorization

- **Purpose:** express what an authenticated member may do.
- **Decision:** permissions are resource/action records mapped to roles; backend authorization is authoritative.
- **Features:** OWNER, ADMIN, MANAGER, and STAFF foundations plus extensible permissions.
- **Security/database/tests:** role/context consistency, active policy checks, permission mapping, and organization-scoped denial behavior.

#### Authentication boundary

- **Purpose:** define provider-neutral authentication without locking the project to a login vendor.
- **Decision:** credential, password-hasher, principal, and session interfaces are separate from authorization.
- **Current scope:** development/test identity adapters and application seams exist; production login, sessions, JWTs, OAuth, and password flows are not implemented.

#### Runtime context

- **Purpose:** carry trusted request and actor facts through application operations.
- **Decision:** organization, actor, role, permissions, source, authentication state, and request ID are server context, never ordinary business payload fields.
- **Impact:** application services can authorize and audit consistently across HTTP, tests, jobs, and future transports.

#### Audit system

- **Purpose:** preserve a controlled history of important business actions.
- **Decision:** audit entries are organization-scoped, append-only, metadata-limited records with no update/delete repository operations.
- **Security:** metadata excludes secrets, raw payloads, tender credentials, and unnecessary personal data.

#### Transactional audit

- **Purpose:** prevent a business write and its audit record from disagreeing.
- **Decision:** transaction-scoped repositories and audit writers share one injected transaction client; no Prisma type escapes infrastructure.
- **Impact/tests:** business and audit writes commit or roll back together, with no hidden or nested transactions.

### 4.3 Platform layer

#### Application service boundary

Application services coordinate validation, trusted context, authorization, transactions, domain use cases, repositories, audit, and safe errors. This layer prevents controllers and user interfaces from becoming the owner of business workflows.

#### API boundary

`@senvo/api` is transport independent. Handlers validate strict contracts, authenticate, authorize, call application services, and map results into stable success/error envelopes. Stack traces and unexpected internal messages are never exposed.

#### HTTP adapter

`@senvo/http` is a thin Node HTTP runtime adapter. It owns route matching, bounded JSON parsing, request IDs, security headers, trusted-context construction, and HTTP status mapping. Development headers are explicitly non-production mechanisms.

#### Admin application

The Next.js Admin application provides business-facing workspaces and a typed API client. Navigation visibility is permission aware, but backend authorization remains the source of truth. The UI has no Prisma or domain repository access.

### 4.4 Catalog layer

#### Catalog identity and management

Categories, collections, products, and variants establish durable merchandise identity. Products and variants are separate because a garment design and a sellable color/size SKU have different lifecycles. Product lines snapshot display facts when historical sales records require stability.

Admin catalog pages provide list, detail, creation, status, loading, empty, and error states through API/application boundaries. Organization-scoped normalized names, codes, slugs, and SKUs prevent duplicates at the correct scope.

#### Colors and sizes

Colors contain business name, normalized code, and validated hex value. Sizes contain name, normalized code, and non-negative sort order. Both are organization-owned catalog attributes with active/inactive lifecycle behavior and tenant isolation.

#### Barcode foundation

Variant barcodes are catalog-owned identities with type, status, uniqueness, one-active-barcode-per-variant rules, and organization-safe references. The lookup boundary supports future scanners while keeping hardware concerns outside domain logic.

### 4.5 Inventory layer

#### Immutable inventory ledger

Posted movement lines are the stock source of truth. On-hand is derived, never independently edited. Opening, receipt, issue, transfer, and adjustment movements support operational stock history. Posting uses transaction-fresh validation, advisory locks, idempotency, and negative-stock prevention.

#### Reversal

Corrections use compensating movements rather than mutation. A posted movement remains immutable, one direct reversal is allowed, and server-derived reversal payloads preserve the original history.

#### Reservation and availability

Reservations hold stock without changing on-hand. Active reservation quantities reduce available-to-sell (ATS):

```text
reserved = sum(active reservation lines)
ATS = posted on-hand - reserved
```

Confirmation does not itself reduce on-hand; fulfillment consumes the reservation through an immutable inventory movement. Expiry and release are explicit lifecycle actions.

#### Allocation

Allocation chooses one fully capable stock location using deterministic priority order. Preview is advisory; final allocation revalidates inside the transaction under the shared inventory lock namespace. Split fulfillment, hold/transit allocation, and silent partial allocation are deliberately prohibited.

### 4.6 Sales layer

#### Sales order core

Sales orders use integer minor-unit money, immutable line snapshots, organization-scoped order/idempotency identity, and statuses `DRAFT`, `RESERVED`, `CONFIRMED`, `CANCELLED`, and `FULFILLED`. Reservation precedes confirmation; fulfillment consumes reserved inventory; cancellation releases active reservations.

#### Draft amendment

Only draft orders may be amended. Metadata can be replaced or cleared, while lines use full replacement and fresh catalog snapshots. Optimistic concurrency requires an expected version and increments the order exactly once per successful amendment.

#### Sales channels and booths

Canonical sources are `ONLINE`, `OFFLINE_STORE`, and `EVENT_BOOTH`. Event sales require a booth reference; non-booth sales reject one. Booths preserve names, locations, operating dates, responsible staff, status, and history. Aggregations prepare sales-by-channel and sales-by-booth reporting.

### 4.7 POS layer

#### Counters, sessions, carts, and barcode lookup

POS selling has organization-owned sales counters linked to stores or booths, cashier sessions, one server-owned cart per session, barcode lookup, current availability, and server-selected prices. Trusted context supplies staff identity; another cashier cannot read or mutate the cart even within the same organization.

#### Checkout

Checkout locks and reloads the cart, current prices, source, staff, catalog, and allocation facts. One transaction creates and fulfills the sales order, reserves and consumes inventory, records payment facts, writes immutable receipt snapshots, and appends audit entries. Idempotent retries cannot duplicate completion.

#### Guided selling UI

The Admin `New Sale` workspace supports session recovery, barcode/manual product lookup, cart editing, payment entry, completed-sale receipts, and retry-safe preparation of a next sale. Session reconciliation handles response loss without creating duplicate sessions.

#### Payment and receipts

Checkout-time tenders support cash, card, mobile banking, and bank transfer records. The system stores safe operational references, not card credentials. Outstanding balances are explicit and permission controlled. Every committed checkout produces an immutable printer-independent receipt snapshot.

#### Outstanding balance collection

Later payment collections are append-only events with their own receipts. They lock the checkout account, derive current due after returns/refunds, preserve idempotency, and never rewrite the opening payment batch or original receipt.

#### Merchandise returns and credit

Returns are append-only records against completed POS sales. Returned quantities go to an active non-sellable `RETURN_HOLD` location through an `ADJUSTMENT_IN` movement. Integer cumulative allocation prevents partial-return rounding drift. A return records credit but does not claim that money has been refunded.

#### Refund recording

Refunds are separate append-only checkout settlement events. The current foundation records a refund that authorized staff confirms was issued externally, supports split methods, creates an immutable refund receipt, and serializes against returns and collections. Automated provider refund execution remains future work.

### 4.8 Commerce layer

#### Storefront MVP

The public Storefront supports active catalog browsing, product detail, a versioned guest bag, Bangladesh delivery/contact fields, cash-on-delivery preference, and order confirmation. The public tenant is resolved server-side from `STOREFRONT_ORGANIZATION_CODE`.

Persisted bag lines contain only variant ID and quantity. Cart and checkout hydrate current server catalog facts before showing totals. The POST includes the last reviewed unit price only as comparison data; the server reloads current prices and rejects a mismatch before any write. A successful guest checkout atomically creates an `ONLINE` reserved sales order, commerce profile, inventory reservation, and audit entry. COD creates no payment batch because it is a payment preference, not proof of payment.

## 5. Complete Architecture Explanation

### 5.1 High-level architecture

```text
Frontend applications
  Admin | POS | Storefront
            |
            v
HTTP runtime adapter
            |
            v
Transport-independent API boundary
            |
            v
Application services and transaction coordination
            |
            v
Domain policies, use cases, and repository contracts
            |
            v
Database infrastructure and external adapters
            |
            v
PostgreSQL
```

The separation exists to keep decisions in the layer that owns them:

- frontends own interaction and presentation, not business truth;
- HTTP owns protocol mechanics, not sales or inventory rules;
- API handlers own transport validation and response mapping;
- application services own workflow orchestration, authorization, transaction scope, and audit coordination;
- domain code owns invariants and business terminology;
- repository interfaces express persistence needs without importing Prisma;
- database infrastructure owns SQL, Prisma, row/advisory locks, and transaction clients.

This structure allows a future mobile client, background worker, or alternate HTTP framework to reuse business behavior. It also allows database and hardware adapters to change without rewriting domain rules.

### 5.2 Modular-monolith model

SENVO Wear is one deployable system with explicit internal boundaries. It avoids premature distributed-system complexity while preserving bounded contexts for organization, identity, authorization, catalog, inventory, sales, POS, payment, audit, and Storefront commerce. Cross-package imports use public exports, and `boundary:check` enforces critical dependency directions.

### 5.3 Write transaction model

High-value writes use one outer transaction. Repositories receive an injected transaction client and do not create hidden or nested transactions. Operations lock stable ownership rows or inventory lock keys, reload current facts, apply domain rules, persist business and audit records, and commit only after every step succeeds.

### 5.4 Read model strategy

Read projections are allowed to assemble data for specific screens, but they remain organization scoped and cannot become alternate sources of truth. Examples include ATS, sales-by-channel, payment settlement, receipt documents, Admin lists, and public catalog availability.

## 6. Technology Stack

| Area             | Technology                                           | Role                                                               |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Frontend         | Next.js 16, React 19, TypeScript                     | Admin, POS, and Storefront applications                            |
| Backend runtime  | Node.js 22 LTS, TypeScript                           | HTTP and application execution                                     |
| Database         | PostgreSQL 17                                        | Transactional system of record                                     |
| Data access      | Prisma 7                                             | Schema, migrations, generated client, and transactions             |
| Monorepo         | pnpm 11, Turborepo                                   | Workspaces, orchestration, and caching                             |
| Validation       | Strict shared contracts                              | Request and response boundary validation                           |
| Testing          | Vitest                                               | Unit, component-like, boundary, and integration tests              |
| Quality          | ESLint, Prettier, TypeScript, custom boundary checks | Static verification                                                |
| CI/CD foundation | GitHub Actions                                       | Clean install, quality, PostgreSQL reset/reapply, and drift checks |
| Architecture     | Domain-driven modular monolith                       | Stable business and infrastructure boundaries                      |

## 7. Repository Structure

### 7.1 Applications

- `apps/admin`: operational owner/staff application for catalog, inventory, sales, organization/team, booths, POS selling, payment history, returns, refunds, and receipts.
- `apps/pos`: dedicated POS application boundary and future focused cashier runtime.
- `apps/storefront`: public catalog, guest bag, checkout, COD order creation, and order confirmation.

### 7.2 Shared packages

- `packages/domain`: business models, value objects, policies, use cases, repository contracts, errors, and transport/infrastructure-neutral types.
- `packages/application`: trusted-context validation, authorization hooks, transaction coordination, service results, composition contracts, and cross-domain workflows.
- `packages/database`: Prisma schema/client, repository implementations, locking, transaction manager, migrations, and PostgreSQL integration tests.
- `packages/contracts`: strict API request/response schemas and browser-safe DTOs.
- `packages/api`: transport-independent handlers, authentication/authorization pipeline, and public error mapping.
- `packages/http`: Node HTTP routing, headers, request IDs, body limits, trusted context factory, and response status mapping.
- `packages/ui`: shared business-neutral UI primitives and tokens.
- `packages/config`: shared TypeScript, ESLint, test, and workspace configuration.
- `packages/logger`: structured logging boundary with safe metadata expectations.
- `packages/storage`: provider-neutral object-storage boundary reserved for future media/document needs.
- `packages/testing`: shared fixtures and test helpers.
- `packages/utils`: small generic utilities with no business ownership.

### 7.3 Documentation and operations

- `docs/architecture`: current module and workflow explanations.
- `docs/decisions`: ADR-001 through ADR-101.
- `docs/security`: trust, identity, authorization, audit, and public-boundary policies.
- `docs/requirements`: milestone requirements and invariants.
- `docs/operations`: environment, migration, and verification procedures.
- `docs/workflows`: developer-facing end-to-end business flows.
- `scripts`: boundary, database, migration, race, and package-resolution verification.

## 8. Database Design Overview

The database uses additive reviewed migrations, application-generated UUIDs, timestamps, restrictive foreign keys, organization-scoped composite keys, explicit uniqueness, lifecycle status, and versions where concurrent updates require them.

### 8.1 Core relationships

- **Organization** owns operational stores/branches, stock locations, counters, memberships, catalog, inventory, orders, booths, POS, payment history, and audit entries.
- **User** is globally identified; **OrganizationMembership** grants organization access and a role. **UserCredential** is the provider-neutral authentication record.
- **Permission** and **RolePermission** describe authorization policy independently from membership identity.
- **Product** belongs to a category and has **ProductVariant** records. Variants reference color/size attributes, selling price, and **VariantBarcode** identities. **ProductCollection** provides many-to-many merchandising membership.
- **InventoryMovement** and immutable lines form on-hand history. **InventoryReservation** and lines form held-stock history. **InventoryAllocationPolicy** orders candidate locations.
- **SalesOrder** and immutable lines record commercial intent, snapshots, money, lifecycle, reservation, fulfillment, channel, and optional booth.
- **SalesBooth** preserves event-source history and responsible staff.
- **SalesCounter**, **SalesSession**, **PosCart**, and **PosCartLine** represent active assisted selling ownership.
- **PosCheckoutRecord** links the completed cart and fulfilled sales order. Payment batches, collections, returns, refunds, and their receipts append financial and merchandise history.
- **SalesOrderCommerceProfile** stores guest commerce contact/delivery facts without turning a guest into a customer account.
- **AuditEntry** records controlled business actions and actors without update/delete operations.

### 8.2 Integrity principles

Database constraints provide defense in depth for tenant-safe references, one-to-one records, idempotency, lifecycle-compatible source links, positive quantities, minor-unit equations, and immutable history. Application validation improves errors, but the database still rejects invalid relationships if another adapter is introduced later.

## 9. Security Architecture

### 9.1 Organization isolation

Organization ID is derived from trusted runtime context or server-side Storefront tenant resolution. Repositories filter by organization, and composite foreign keys prevent records from referencing another organization's children. Cross-tenant lookup generally appears as not found rather than revealing existence.

### 9.2 Trusted execution context

User ID, organization ID, role, permissions, source, authentication state, and request ID are context fields. Browsers cannot choose them in business payloads. Development header adapters are forbidden as production identity mechanisms.

### 9.3 Authentication and authorization

Authentication resolves a principal; membership resolves organization access; authorization evaluates a required resource/action permission. These are separate concerns. UI permission checks only hide unavailable navigation and never replace backend checks.

### 9.4 Server authority

The server derives prices, totals, stock, sales channel, booth/store source, staff identity, order and receipt identifiers, settlement, and timestamps. Storefront reviewed price is comparison data. POS cart and checkout ownership are checked against the authenticated cashier.

### 9.5 Audit and transaction safety

Audit is append only, organization scoped, metadata controlled, and included in the same transaction for integrated workflows. Locks and idempotency serialize operations where retries or concurrency could duplicate stock, payments, returns, or refunds.

### 9.6 Data minimization

The system does not accept or store card PAN, CVV, PIN, OTP, provider credentials, or raw payment-provider payloads. Logs and audit metadata exclude secrets, raw request payloads, and unnecessary personal information.

## 10. Important Engineering Decisions

The repository contains 101 detailed ADRs. The following grouped summary captures the most consequential decisions; the ADR files remain the normative rationale.

| Problem                    | Decision                                                                                | Reason and impact                                                             |
| -------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Early operational scale    | Modular monolith in a monorepo                                                          | Keeps deployment and transactions simple while enforcing internal boundaries. |
| UI/backend coupling        | Separate Admin, POS, Storefront, HTTP, API, application, domain, and database layers    | Prevents transport or presentation code from owning business rules.           |
| Mutable stock balances     | Immutable movement ledger with derived on-hand                                          | Preserves explainable history and prevents silent balance edits.              |
| Corrections                | Compensating movements                                                                  | Posted facts remain immutable and auditable.                                  |
| Online/offline contention  | Reservations separated from movements; ATS derived from active reservations             | Holds stock without falsifying on-hand and provides one oversell model.       |
| Allocation ambiguity       | Deterministic single-location priority allocation with transaction revalidation         | Makes results reproducible and avoids hidden partial fulfillment.             |
| Money precision            | Integer minor units                                                                     | Avoids floating-point financial errors.                                       |
| Historical catalog changes | Sales and receipt snapshots                                                             | Old orders remain readable after product/staff/organization edits.            |
| Draft edits                | Full line replacement plus optimistic concurrency                                       | Produces one coherent draft state and detects stale writers.                  |
| Tenant trust               | Organization identity from trusted context                                              | Prevents client-controlled cross-tenant access.                               |
| Identity complexity        | User separated from organization membership                                             | Supports one person in multiple organizations.                                |
| Access growth              | Resource/action permissions mapped to roles                                             | Extensible beyond a hard-coded role switch.                                   |
| Authentication vendor risk | Provider-neutral authentication boundary                                                | Defers vendor/session choice without contaminating domain rules.              |
| Audit consistency          | Business and audit writes in one transaction                                            | Eliminates successful writes without corresponding audit history.             |
| ORM leakage                | Prisma contained in database infrastructure                                             | Keeps domain/application contracts portable and testable.                     |
| UUID drift                 | Application-generated UUIDs                                                             | Matches Prisma schema and avoids database-default drift.                      |
| API errors                 | Stable public error codes and envelopes                                                 | Enables safe typed clients without leaking stack traces.                      |
| POS pricing                | Server-selected transaction-fresh price                                                 | Prevents cashier/browser price authority.                                     |
| Storefront cart            | Persist only variant ID and quantity                                                    | Prevents stale/tampered local metadata from becoming truth.                   |
| Checkout price review      | Compare reviewed price to current server price before writes                            | Makes price changes explicit and preserves server authority.                  |
| Retry safety               | Scoped idempotency keys plus normalized signatures                                      | Replays uncertain outcomes without duplicating business facts.                |
| Payment history            | Opening payments, later collections, return credits, and refunds are append-only events | Preserves original receipts and supports explainable settlement.              |
| Return stock               | Partial returns enter non-sellable Return hold via adjustment                           | Protects sellable stock until inspection/disposition exists.                  |
| Hardware ownership         | Scanner/printer code belongs in replaceable infrastructure adapters                     | Keeps vendor protocols out of commerce rules.                                 |

## 11. Hardware Integration Roadmap

### 11.1 Barcode scanners

Keyboard-wedge scanners can initially emit barcode text into the existing organization-scoped barcode lookup route. Camera or native scanners should implement a replaceable input adapter that produces the same lookup command. Domain code does not need a hardware driver.

### 11.2 Product and label barcodes

Variant barcode ownership, status, uniqueness, and lookup already exist. Future label composition should consume a catalog projection and produce a printer-independent label document. Label templates, print density, dimensions, and calibration belong to output adapters and configuration.

### 11.3 Xprinter XP-T361U

The Xprinter XP-T361U should be integrated behind a transport interface supporting USB/network discovery, capability detection, job submission, status, retry, and cancellation. ESC/POS, TSPL, or device-specific commands must remain outside domain and application packages.

### 11.4 Receipt printing

Immutable receipt projections already separate receipt facts from presentation. A future renderer can produce browser HTML/PDF or printer commands, and a printer adapter can send the result. Print failure must not roll back a committed sale; it is a recoverable post-transaction operation with reprint support.

## 12. Current Feature Matrix

| Feature                          | Status                | Notes                                                           |
| -------------------------------- | --------------------- | --------------------------------------------------------------- |
| Organization and store structure | Completed foundation  | Lifecycle, versions, tenant-safe repositories, Admin management |
| Identity and memberships         | Completed foundation  | Production sign-in transport still pending                      |
| Roles and permissions            | Completed foundation  | Backend enforcement; advanced policy administration can grow    |
| Catalog management               | Completed foundation  | Categories, collections, products, variants, colors, sizes      |
| Barcode management and lookup    | Completed foundation  | Hardware scanner adapter pending                                |
| Inventory ledger                 | Completed foundation  | Immutable movements, reversal, negative-stock protection        |
| Reservations and ATS             | Completed foundation  | Ledger/reservation-derived availability                         |
| Allocation                       | Completed foundation  | Deterministic single-location strategy                          |
| Sales orders                     | Completed foundation  | Lifecycle, amendment, inventory coordination                    |
| Channels and booths              | Completed foundation  | ONLINE, OFFLINE_STORE, EVENT_BOOTH and summaries                |
| Admin operational UI             | Functional foundation | Multiple production workflows; broader UX hardening remains     |
| POS sessions and cart            | Completed foundation  | Trusted cashier ownership and recovery                          |
| POS checkout                     | Completed foundation  | Atomic order, inventory, payment, receipt, and audit            |
| Payment recording                | Completed foundation  | No online provider authorization/capture                        |
| Outstanding collection           | Completed foundation  | Append-only payment events and receipts                         |
| Merchandise returns              | Completed foundation  | Return hold and credit; exchanges/QC disposition pending        |
| Refund recording                 | Completed foundation  | Manual confirmation; provider automation pending                |
| Storefront                       | MVP completed         | Guest catalog, bag, server-priced COD checkout                  |
| Customer accounts and CRM        | Planned               | No account/login/profile history yet                            |
| Courier and order tracking       | Planned               | No delivery-provider integration                                |
| Analytics and BI                 | Planned               | Some source/booth summaries exist                               |
| Hardware drivers                 | Planned               | Domain extension points documented                              |
| Production deployment            | Planned               | No cloud/runtime deployment package in scope                    |

## 13. Testing and Quality Report

At this snapshot, local verification reports **429 passing tests** plus **149 PostgreSQL integration tests** that are skipped when no local PostgreSQL service is configured. The latest branch-head CI ran all 149 integration tests twice with zero skips: once after migration deployment and once after a complete database reset and migration reapplication.

The CI quality job performs:

1. frozen-lockfile installation;
2. package-boundary checks;
3. formatting, lint, and type checking;
4. all unit/application/API/UI tests;
5. Prisma schema validation and client generation;
6. normal and clean production builds;
7. dependency audit at moderate severity.

The PostgreSQL job uses PostgreSQL 17 and performs:

1. isolated test database creation;
2. migration encoding verification;
3. deployment and migration status;
4. the full integration suite;
5. destructive test-database reset;
6. reapplication of all 23 migrations;
7. the full integration suite again;
8. Prisma schema drift comparison, requiring `No difference detected.`

Additional scripts verify Prisma CLI compatibility, generated-client concurrency, integration package resolution, safe test database targets, and migration encoding. Tests cover domain invariants, authorization, organization isolation, idempotency, transaction rollback, concurrency locks, strict contracts, API errors, UI states, reset/reapply behavior, and drift.

## 14. Current Limitations

- Production authentication, session, login, password reset, and provider selection are not implemented.
- Online payment gateway authorization, capture, webhooks, chargebacks, and automated refunds are not implemented.
- Existing refund functionality records externally completed refunds; it is not a provider integration.
- Returns support merchandise credit and Return hold, but exchanges, approval queues, QC disposition, restocking, and automated provider refunds remain pending.
- Customer accounts, CRM, loyalty, notifications, and communication preference management are pending.
- Courier integration, shipping rates, fulfillment dispatch, and customer order tracking are pending.
- Tax, promotions, coupons, broad discount allocation, costing, valuation, accounting, and finance modules are pending.
- Scanner and printer extension points exist, but no hardware drivers or cash-drawer control are implemented.
- Reporting is operational and limited; full analytics, BI, forecasting, and executive dashboards are pending.
- Production deployment, observability platform, backup/restore operations, and service-level objectives require a dedicated milestone.

## 15. Future Roadmap

### Phase 1: Complete commerce operations

- production authentication and protected runtime context;
- customer accounts or secure guest order lookup;
- courier/shipping integration and order tracking;
- catalog media and publishing workflows;
- return inspection, disposition, restocking, and exchange flows;
- production UX accessibility and end-to-end browser testing.

### Phase 2: Payments and financial operations

- Bangladesh-relevant payment gateway adapters;
- authorization, capture, webhook, reconciliation, and automated refund flows;
- tax, discount, promotion, and delivery charge allocation;
- cash-drawer and end-of-day reconciliation;
- accounting export boundaries.

### Phase 3: Analytics and planning

- channel, store, booth, product, staff, and settlement dashboards;
- inventory aging, replenishment, transfer recommendations, and low-stock alerts;
- margin and cost models;
- governed reporting projections and exports.

### Phase 4: AI-assisted operations

- demand forecasting and replenishment suggestions;
- anomaly detection for stock and settlement activity;
- catalog enrichment and search assistance;
- customer-service drafting with strict data-access controls;
- human-reviewed operational recommendations rather than autonomous financial writes.

### Phase 5: Enterprise scaling

- deployment automation, observability, disaster recovery, and SLOs;
- background job and event boundaries where justified;
- larger tenant and location scale testing;
- data retention, privacy, compliance, and advanced access governance;
- selective service extraction only after measured modular-monolith limits.

## 16. Developer Onboarding Guide

### 16.1 Understand first

1. Read `docs/SENVO-WEAR-ARCHITECTURE-OVERVIEW.md` and the relevant module architecture file.
2. Identify the domain invariant and source of truth before editing a screen or repository.
3. Follow the dependency direction: adapter to API to application to domain contract to infrastructure.
4. Learn trusted context, organization isolation, transaction scope, idempotency, and audit expectations.
5. Read the relevant ADRs and migration history before changing a durable decision.

### 16.2 Local setup

Use Node.js 22 LTS and pnpm 11.9.0. Install with a frozen lockfile when reproducing CI. Configure only untracked environment files from `.env.example`; never commit secrets. PostgreSQL is required for full integration verification but not for most static/unit checks.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm dev:admin
pnpm dev:pos
pnpm dev:storefront
```

### 16.3 Development workflow

1. Define scope and read existing contracts, ADRs, and tests.
2. Change the owning domain/application boundary before adapters or UI.
3. Keep organization/actor facts out of browser-controlled payloads.
4. Add an additive migration only when persistence changes; never edit historical migrations after release.
5. Add focused tests at the lowest meaningful boundary and integration coverage for database behavior.
6. Update architecture/security/ADR documentation for durable decisions.
7. Run the complete quality suite and inspect the final diff.
8. Use normal commits and pushes; do not rewrite published history without explicit coordination.

Essential checks are `pnpm format:check`, `pnpm boundary:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm db:validate`, `pnpm db:generate`, `pnpm build`, and `pnpm audit --audit-level moderate`. Database changes additionally require deploy, status, reset/reapply, integration, and drift verification.

## 17. SENVO AI Context

SENVO Wear is a TypeScript/PostgreSQL modular-monolith ERP for an omnichannel clothing business. Its three frontends are Admin, POS, and Storefront. Business rules belong in domain/application packages; API and HTTP are adapters; Prisma is confined to database infrastructure. Organization and actor identity come from trusted context, not request bodies. Inventory is an immutable ledger; ATS is derived from on-hand minus active reservations. Sales, payments, collections, returns, refunds, receipts, and audit history use append-only or tightly controlled lifecycle records. Prices, totals, settlement, and stock are server authoritative.

An AI working on this project must:

- read current source, module docs, ADRs, migrations, and tests before proposing changes;
- preserve organization isolation, restrictive references, server authority, idempotency, locking, audit, and historical immutability;
- avoid direct Prisma/domain imports from browser applications;
- avoid hidden/nested transactions and client-controlled identity or totals;
- never edit prior migrations, weaken tests, expose secrets, or silently broaden milestone scope;
- use additive, focused changes with corresponding contracts, tests, documentation, and full verification;
- distinguish implemented foundations from production-complete integrations.

For a compact machine-oriented handoff, read `docs/SENVO-WEAR-AI-CONTEXT.md`. For dependency and transaction diagrams, read `docs/SENVO-WEAR-ARCHITECTURE-OVERVIEW.md`. Detailed decisions remain in `docs/decisions`.
