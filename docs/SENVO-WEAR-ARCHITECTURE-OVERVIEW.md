# SENVO Wear Architecture Overview

- **Snapshot:** August 2026
- **Architecture style:** Domain-driven modular monolith in a pnpm/Turborepo monorepo

## 1. Purpose

This document is the fast architectural map for SENVO Wear. It explains boundaries, dependency direction, transaction ownership, data authority, and the major runtime flows. For business history and roadmap, see `SENVO-WEAR-MASTER-DOCUMENTATION.md`. For machine-oriented implementation constraints, see `SENVO-WEAR-AI-CONTEXT.md`.

## 2. System Context

SENVO Wear serves three user experiences over one shared commerce core:

```text
Business owner / manager ----> Admin application
Cashier / event staff -------> POS and guided selling application
Public shopper --------------> Storefront application
                                      |
                                      v
                            Shared server boundaries
                                      |
                                      v
                         PostgreSQL system of record
```

The shared core prevents Admin, POS, and Storefront from inventing different catalog, stock, pricing, order, access, or settlement rules.

## 3. Layered Runtime

```text
+--------------------------------------------------------------+
| Applications                                                 |
| apps/admin | apps/pos | apps/storefront                      |
+-------------------------------+------------------------------+
                                |
                                v
+--------------------------------------------------------------+
| HTTP adapter (@senvo/http)                                   |
| routes, request IDs, security headers, body limits, context  |
+-------------------------------+------------------------------+
                                |
                                v
+--------------------------------------------------------------+
| API boundary (@senvo/api)                                    |
| strict validation, authn/authz hooks, response/error mapping |
+-------------------------------+------------------------------+
                                |
                                v
+--------------------------------------------------------------+
| Application layer (@senvo/application)                       |
| orchestration, trusted context, transactions, audit          |
+-------------------------------+------------------------------+
                                |
                                v
+--------------------------------------------------------------+
| Domain layer (@senvo/domain)                                 |
| invariants, use cases, value objects, repository contracts   |
+-------------------------------+------------------------------+
                                |
                                v
+--------------------------------------------------------------+
| Infrastructure (@senvo/database and future adapters)         |
| Prisma repositories, SQL locks, transaction client, printers |
+-------------------------------+------------------------------+
                                |
                                v
+--------------------------------------------------------------+
| PostgreSQL 17                                                |
+--------------------------------------------------------------+
```

### 3.1 Applications

Applications own rendering, interaction state, loading/error/empty states, accessibility, and calls to typed API clients. They may perform client validation for usability but cannot become the authority for prices, stock, identity, permissions, settlement, or lifecycle decisions.

### 3.2 HTTP adapter

The HTTP adapter owns protocol mechanics: route matching, bounded JSON parsing, request IDs, baseline security headers, trusted request-context construction, and status mapping. It is replaceable and contains no business logic.

### 3.3 API boundary

API handlers parse strict contracts, invoke authentication and authorization, call an application operation, and return the standard envelope:

```ts
type ApiResponse<T> =
  | { success: true; data: T; requestId: string }
  | { success: false; error: ApiError; requestId: string };
```

Unknown input fields are rejected. Internal exceptions map to safe public errors without stack traces.

### 3.4 Application layer

Application services are the workflow boundary. They validate trusted context, authorize operations, open the required outer transaction, coordinate multiple domain/repository operations, append audit records, and normalize safe errors.

### 3.5 Domain layer

The domain contains business language and invariants. It does not import Next.js, React, Prisma, HTTP frameworks, or browser DTO assumptions. Repository contracts describe what the domain needs without choosing storage technology.

### 3.6 Infrastructure

The database package implements contracts with Prisma and PostgreSQL. It owns generated client code, schema, migrations, transaction-scoped repositories, row locks, advisory locks, and integration tests. Future payment, courier, scanner, printer, storage, or messaging providers must enter through equivalent adapters.

## 4. Dependency Rules

The intended dependency direction is inward:

```text
apps -> contracts/ui/API clients
http -> api + browser-neutral contracts
api -> application + contracts
application -> domain contracts + contracts
database -> domain/application contracts + Prisma
domain -> no framework or infrastructure dependency
```

Important prohibitions:

- applications do not import Prisma, database repositories, or server-only application internals;
- domain does not import API/HTTP/UI/infrastructure code;
- API handlers do not access the database directly;
- HTTP routes do not implement authorization or business policies;
- repositories are consumed through public package exports, not deep imports;
- shared UI remains business neutral.

`pnpm boundary:check` enforces the critical forbidden directions.

## 5. Bounded Contexts

| Context             | Owns                                                         | Does not own                               |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| Organization        | tenant, stores, locations, counter configuration, lifecycle  | user authentication, stock balances        |
| Identity            | user and organization membership                             | permission evaluation, session transport   |
| Authorization       | role/permission policy and decisions                         | login credentials                          |
| Authentication      | principal/credential boundary                                | organization access policy                 |
| Catalog             | category, collection, product, variant, color, size, barcode | stock and sales history                    |
| Inventory           | immutable movements, reservations, ATS, allocation           | product merchandising, payments            |
| Sales               | order intent, lifecycle, channel, booth, snapshots           | tender execution                           |
| POS                 | counter/session/cart/checkout coordination                   | catalog ownership or mutable stock balance |
| Payment             | payment batches, collections, refunds, settlement facts      | card credentials or provider secrets       |
| Receipt             | immutable historical documents                               | printer transport                          |
| Audit               | controlled append-only action history                        | application logs or analytics              |
| Storefront commerce | public tenant resolution and guest profile                   | customer accounts or payment capture       |

## 6. Trusted Context and Security

Protected requests are converted into an application context containing trusted values such as request ID, user/actor, organization, role, permissions, source, and authentication state. These values are never accepted from ordinary business payloads.

```text
Untrusted request
   |
   | body: quantities, selected IDs, customer-entered business data
   v
HTTP context factory
   |
   | trusted: actor, organization, role, permissions, requestId
   v
API authentication and authorization
   v
Application context validation and defense-in-depth authorization
```

Organization-scoped repository predicates and composite foreign keys provide a second layer of isolation. UI visibility is never treated as access control. Development header identity is restricted to development/test construction.

## 7. Transaction Architecture

### 7.1 Transaction context

The domain/application boundary defines a technology-neutral transaction context. Infrastructure opens one Prisma interactive transaction and injects transaction-scoped repositories plus an audit writer. Repositories do not open nested transactions.

### 7.2 Locking strategy

- inventory posting/reservation/allocation uses stable organization-location-variant advisory lock keys acquired in deterministic order;
- draft amendments lock the organization-scoped order and check expected version;
- POS checkout locks the cart/session ownership state;
- payment collection, return, and refund operations serialize on the checkout row;
- uniqueness and payload signatures provide database-backed idempotency defense.

### 7.3 Atomicity

For an integrated write:

```text
BEGIN
  reload current facts under lock
  validate organization, actor, lifecycle, stock, price, settlement
  perform domain/business writes
  append immutable history and audit
COMMIT

Any failure -> ROLLBACK all writes
```

## 8. Sources of Truth

| Concern                | Source of truth                                                      |
| ---------------------- | -------------------------------------------------------------------- |
| Organization access    | active user + active organization membership + backend authorization |
| Product identity       | catalog product/variant records                                      |
| Barcode identity       | active catalog barcode record                                        |
| Selling price          | current server-side product variant price                            |
| On-hand stock          | sum of posted inventory movement lines                               |
| Reserved stock         | active reservation lines                                             |
| Available-to-sell      | on-hand minus active reservations                                    |
| Sales history          | sales order plus immutable line snapshots                            |
| Checkout-time payment  | immutable payment batch and lines                                    |
| Later received money   | append-only payment collections                                      |
| Merchandise credit     | append-only completed returns                                        |
| Issued refund          | append-only refund events                                            |
| Receipt history        | immutable receipt snapshots                                          |
| Security/audit history | append-only audit entries                                            |

Read models and browser state may display these facts but do not replace them.

## 9. Core Workflows

### 9.1 Inventory posting

```text
Create draft movement -> validate lines -> acquire locks -> recompute balances
-> prevent negative stock -> post immutable movement -> append audit -> commit
```

Corrections create a compensating movement; they never edit the posted record.

### 9.2 Reservation and fulfillment

```text
Select allocation policy -> evaluate candidates -> lock candidate inventory
-> recompute ATS -> create active reservation -> confirm order
-> consume reservation into posted ISSUE -> fulfill order
```

Cancellation releases an active reservation. Confirmation alone does not reduce on-hand.

### 9.3 POS checkout

```text
Authenticated cashier session/cart
-> lock and reload cart, current price, barcode, source, and stock
-> create order -> reserve -> confirm -> consume -> fulfill
-> persist checkout/payment/receipt/audit
-> commit one transaction
```

Browser-submitted identity, price, source, totals, and inventory identifiers are not accepted.

### 9.4 Return, collection, and refund settlement

These operations share the checkout row as a serialization point:

```text
adjusted payable = opening payable - completed return credit
gross received = opening payment + collections
net received = gross received - issued refunds
amount due = max(adjusted payable - net received, 0)
refund due = max(net received - adjusted payable, 0)
```

Every event is append only and receives its own immutable receipt where applicable.

### 9.5 Storefront checkout

```text
Persist variant IDs + quantities only
-> hydrate current public catalog facts
-> show current prices and availability
-> submit reviewed prices as comparison facts
-> server reloads current price/stock
-> reject mismatch before writes
-> create ONLINE RESERVED order + commerce profile + reservation + audit
```

COD is recorded as a preference; it does not create false payment history.

## 10. Database and Migration Policy

- PostgreSQL is the authoritative datastore.
- Prisma schema and reviewed additive migrations must agree exactly.
- IDs are application-generated UUIDs unless an explicit ADR states otherwise.
- Previous migrations are immutable after publication.
- Production uses migration deployment, never `db push`.
- Test scripts reject production-like database names and environments.
- CI deploys, checks status, runs integration tests, resets, reapplies all migrations, runs tests again, and requires clean drift.

At this snapshot there are 23 migrations.

## 11. Error and Observability Boundaries

Errors are translated into stable categories such as validation, authentication, forbidden, not found, conflict, concurrency, business rule, and internal. Responses carry request IDs. Stack traces, SQL, secrets, raw payloads, payment credentials, and sensitive personal fields are not public error content.

Audit is not a replacement for operational logging, analytics, tracing, or metrics. Those future systems should consume safe metadata and preserve request correlation without changing domain history.

## 12. Extension Strategy

New capabilities should enter through the owning boundary:

- payment gateway: payment application/infrastructure adapter;
- courier: fulfillment/delivery adapter and dedicated contracts;
- scanner: POS input adapter calling barcode lookup;
- receipt/label printer: output renderer plus printer transport;
- customer account: identity/customer bounded context, not guest profile mutation;
- analytics: read projections or warehouse exports, not transactional table mutation;
- background processing: explicit job/application adapters with the same trusted context and idempotency rules.

Do not extract microservices merely to add an external provider. First add a replaceable adapter inside the modular monolith and measure whether independent scaling or deployment is necessary.

## 13. Verification Architecture

The repository validates behavior at several levels:

- domain unit tests for invariants and lifecycle rules;
- application tests for orchestration, authorization, rollback, and error mapping;
- API/HTTP tests for strict input, trusted context, response envelopes, and security;
- app tests for routes, permissions, failure states, and retry behavior;
- PostgreSQL integration tests for constraints, locks, organization isolation, and atomicity;
- clean migration deploy/reset/reapply and exact drift comparison;
- build, type, lint, format, dependency audit, package-boundary, generated-client race, and package-resolution checks.

The architecture is considered preserved only when both `quality` and `postgres-integration` CI jobs succeed.
