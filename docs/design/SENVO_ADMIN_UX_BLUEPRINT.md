# SENVO Admin UX Blueprint

Status: design handoff for implementation/integration
Branch: `design/admin-ux-system`
Source branch: `feat/premium-storefront-redesign`

## Product principle

SENVO Admin should make shop operations feel simpler than the underlying backend. The UI speaks in real shop language while the backend keeps authoritative audit, inventory, authorization, payment and order state.

Core rule:

- Catalog = what SENVO sells.
- Barcode/SKU = how a variant is identified.
- Inventory = how many units exist, where they are, and what is actually available to sell.
- Sales Orders = what must be fulfilled and the immutable commercial record.
- POS = fast assisted checkout for physical sales.
- Organization/Team/Roles = who can do what and where.

Never expose a direct editable stock quantity as business truth. Stock changes must flow through inventory movements/reservations/allocation/reversal.

## Visual direction

- Premium fashion operations UI.
- Charcoal/near-black workspace shell.
- Warm off-white surfaces/text where appropriate.
- Restrained SENVO green/lime for positive primary actions and live/available state.
- Burgundy/red only for destructive or critical actions.
- Gold/warm neutral may be used sparingly for premium brand detail.
- Dense data pages remain readable, not decorative.
- Desktop optimized but tablet usable; mobile supports emergency operational tasks.
- One consistent page header, filter bar, data table, drawer, modal and empty-state system.

## Global shell

### Header

- Current organization/store context.
- Global search where real search exists.
- Session/user menu with display name, role and logout.
- No fake notification count. Notifications only appear when a real source exists.

### Navigation

Use the existing permission-aware navigation and existing routes. Do not invent parallel modules.

Current operational areas:

1. Dashboard
2. Catalog
3. Barcodes
4. Inventory
5. Sales Orders
6. Sales Sources
7. Booth History
8. New Sale
9. Checkout History
10. Sales Sessions
11. Sales Counters
12. Organization
13. Store Locations
14. Team
15. Roles

Navigation visibility is UX only; backend permission checks remain authoritative.

## Shared page anatomy

Every operational list page should use the same structure:

1. Breadcrumb / context
2. Page title + one-line purpose
3. Primary action
4. Real summary/attention cards only when backed by data
5. Search and filters
6. Main table/list
7. Row action menu
8. Details drawer or dedicated details page
9. Loading state
10. Empty state with next best action
11. Error state with safe retry
12. Access denied state when permission is missing

No fake metrics, charts, activities or notification counters.

## Dashboard

Purpose: decision screen, not a report dump.

The owner/manager should understand the shop in roughly ten seconds.

Priority sections, only when backed by real read models:

- Sales today / selected period.
- Orders requiring action.
- Inventory attention / low ATS.
- Open POS sessions.
- Recent sales/orders.
- Channel mix: ONLINE / OFFLINE_STORE / EVENT_BOOTH.
- Returns/refunds attention if real data exists.
- Active store/location/team counts if useful.

Every card links to the operational page that resolves the issue.

## Catalog

Purpose: define what SENVO sells.

### Product list

- Product image.
- Product name.
- Category/collection.
- Active state.
- Variant count.
- Media coverage where real data is available.
- Search/filter.
- Add Product primary action.

### Add/Edit Product flow

Step 1: Basic product

- Name
- Category
- Collection
- Description
- Product state

Step 2: Variants

- Color
- Size
- SKU
- variant state

Step 3: Media

- Existing real backend media workflow.

Step 4: Review & Save

After product creation show a useful next-step success panel:

- Generate Barcodes
- Receive Opening Stock
- Add Another Product

Do not add an editable `Stock = N` field to the catalog form.

## Barcodes

Purpose: identify variants for receiving, POS, fulfilment and operations.

### Barcode list

- Barcode preview/value.
- Product.
- Variant.
- SKU.
- Status.
- Updated time.
- Inventory/ATS may be displayed as contextual read-only data if safely available.

Primary actions:

- Generate/Assign Barcodes
- Print Barcodes/Labels

Do not imply import/bulk generation if the backend does not support it.

### Generate barcode flow

Step 1: Select existing product and variants.

Show:

- Product
- Variant
- SKU
- Existing barcode
- Eligible/ineligible status

Prevent duplicate barcode assignment.

Step 2: Review candidate barcodes.

Step 3: Confirm backend persistence.

Step 4: Success with optional Print Labels.

Barcode generation never creates a product or stock movement.

## Inventory

Purpose: know where stock is and perform safe stock operations.

Preferred top-level language:

- On Hand
- Reserved
- Available to Sell (ATS)

### Inventory overview

- Location selector.
- Search product/SKU/barcode.
- Product/variant.
- On Hand.
- Reserved.
- ATS.
- Attention state.
- Last movement.

Primary actions should reflect real business events, such as:

- Receive Stock
- Transfer Stock
- Adjust Stock

Only show operations that the backend actually supports.

### Receive Stock

Real-life workflow:

1. Choose destination stock location.
2. Scan barcode/SKU or search product.
3. Enter received quantity.
4. Optional reference/note when supported.
5. Review.
6. Confirm.

Confirmation creates authoritative inventory movement(s); it never overwrites a quantity field.

### Transfer Stock

1. From location.
2. To location.
3. Scan/search variants.
4. Quantity.
5. Review availability.
6. Confirm transfer movement semantics supported by backend.

### Adjustment

Make the reason explicit and audited. Never silently replace stock truth.

## Sales Orders

Purpose: view and fulfil commercial orders across channels.

List columns should prioritize:

- Order number.
- Channel/source.
- Customer/snapshot label where safe.
- Status.
- Payment status.
- Total.
- Fulfilment/attention state.
- Created time.

Order details should preserve immutable snapshots and append-only payment/refund/return history.

No frontend editing of historical payment records.

## Sales Sources / Booth History

Show real ONLINE / OFFLINE_STORE / EVENT_BOOTH source context. Booth screens should support the existing event-booth model, not create a second event sales system.

## POS: New Sale

Goal: extremely fast physical checkout.

Typical path:

1. Scan barcode or search.
2. Variant enters cart.
3. Quantity adjustment within backend limits.
4. Price/availability from server authority.
5. Payment.
6. Receipt.

Common actions should require minimal typing.

Do not fake payment success.

## Checkout History

Operational history of completed/attempted checkouts using real immutable records. Useful filters: date, counter, staff, payment/status where supported.

## Sales Sessions

Show open/closed POS sessions, counter, staff, timestamps and real totals where authoritative data exists. Opening/closing actions must follow backend session rules.

## Sales Counters

Manage physical counters/register contexts using existing backend capability. Keep creation/editing permission restricted.

## Organization

Show organization identity and settings actually supported by backend. Avoid turning this into a generic settings dump.

## Store Locations

Locations should be understandable operationally:

- Name
- Address/context when stored
- Active state
- Stock location/store relationship where relevant

## Team

Purpose: manage workforce access, not customer identities.

- Member name/email.
- Role.
- Membership status.
- Organization scope.
- Safe actions according to permission.

No public Admin signup.

## Roles

Explain OWNER / ADMIN / MANAGER / STAFF in practical language while backend permission mapping remains authoritative.

Do not let the browser become the authority for roles or permissions.

## Authentication UI

### Admin login

- SENVO branded secure page.
- Email/password.
- Remember me only if workforce session policy supports it.
- Clear invalid credential and inactive-access messages.
- No public registration.
- Safe return URL.

### Authenticated shell

- Real workforce session.
- Display name, organization and role.
- Logout.
- Permission-aware navigation.

A Storefront customer session must never unlock Admin.

## Real-life workflows

### New product arrives for the first time

Catalog → Add Product → Variants/SKUs → Save → Generate Barcodes → Print Labels → Inventory Receive Stock → product becomes sellable according to ATS.

### Existing product receives replenishment

Inventory → Receive Stock → scan barcode/SKU → quantity → confirm.

No need to edit Catalog.

### Physical sale

POS → scan → cart → payment → receipt → inventory movement is recorded automatically.

### Online order

Storefront order → reservation/availability rules → Admin sees fulfilment action → fulfil → allocation/inventory/order state updates through backend authority.

### Return/refund

Find original sale/order → choose supported return/refund action → append financial/history records → inventory reversal/restock movement only when policy allows.

## Automation philosophy

Ask the user only for information the system cannot safely derive.

Examples:

- Auto-resolve current authenticated organization.
- Default current store/counter when unambiguous.
- Resolve product from barcode.
- Derive role/permissions on server.
- Derive ATS from inventory state.
- Preserve audit metadata automatically.
- Prevent duplicates and invalid transitions before submission.

## Error prevention

Design for these before they become support tickets:

- Duplicate barcode.
- Duplicate SKU where prohibited.
- Receiving to inactive/wrong location.
- Selling unavailable stock.
- Double checkout or repeated payment submission.
- Expired/revoked workforce session.
- Inactive membership after login.
- Wrong organization access.
- Missing permission.
- Network failure after mutation request.
- Payment provider timeout/unknown status.
- Large table overflow on tablet/mobile.

Mutations should have safe idempotency/retry behavior where supported by backend.

## Integration rule for coding agents

Agents integrating this design must:

1. Reuse existing Admin routes and `AdminApiClient`.
2. Reuse real contracts/endpoints/read models.
3. Never import Prisma into browser code.
4. Never introduce mock runtime data to make a page look complete.
5. Keep loading/empty/error/access-denied states.
6. Keep backend authorization authoritative.
7. Preserve catalog, inventory ledger, POS, order and payment invariants.
8. If data is missing, add the smallest correct read model/API instead of inventing frontend truth.
9. Do not rebuild an already implemented domain subsystem.
10. Verify changed package tests/typecheck before integration.

## Design implementation sequence

To minimize conflicts with concurrent workforce-auth work:

1. Shared visual system and primitives.
2. Catalog.
3. Barcode.
4. Inventory.
5. Sales Orders.
6. POS operational pages.
7. Organization / Store Locations / Team / Roles.
8. Dashboard after real read models are confirmed.
9. Admin login/authenticated shell after workforce HTTP binding lands.
10. Final responsive/accessibility pass.

This order deliberately avoids making the design branch the authority for authentication or backend business state.
