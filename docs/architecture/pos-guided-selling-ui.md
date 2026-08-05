# POS Guided Selling UI

## Purpose

The Admin `New Sale` workspace turns the existing POS application boundary into one cashier-facing flow: select an open sales counter, scan products, edit the order, enter payment, complete the sale, use receipt actions, and prepare the next sale. React remains a transport client; server application services remain authoritative for identity, organization, session, product, price, stock, payment, sales, receipt, and audit facts.

## Selling context and cart lifecycle

A cashier can sell only through an active counter with an open sales session. One valid session is selected automatically; multiple sessions require an explicit counter choice. With no open session, the workspace links to Sales Sessions and never opens one silently.

The server creates one persisted cart when a session opens. The browser does not create or trust a cart identifier. `GET /pos/carts/:id` returns the organization-scoped current projection with display-safe product details and checkout state. The session list supplies the cart ID, so a normal refresh restores the unfinished cart without browser storage. Checked-out carts remain immutable and resolve to their completed checkout.

`Start new sale` is an explicit command after success. It closes the completed session and opens a new session on the same active counter, producing a fresh server-owned cart.

## Barcode and cart interaction

The scan field accepts keyboard input and submits on Enter, which supports ordinary keyboard-wedge USB and Bluetooth scanners without an SDK. Lookup uses the POS barcode boundary and cart mutations use existing endpoints. Repeated scans update the existing variant line instead of creating duplicates. The server revalidates availability and trusted selling price. A server-confirmed cart refresh follows every mutation.

## Money and payment

Cashiers enter normal Taka strings. A focused parser converts no more than two decimal places to PostgreSQL-safe integer minor units with string and `BigInt` arithmetic. The browser never submits floating-point amounts or trusted order totals.

The payment panel defaults to one full Cash payment. It supports up to eight Cash, Card, Mobile banking, or Bank transfer lines. Non-cash lines accept only a safe transaction reference; credential, card, PIN, OTP, and secret fields do not exist. References stay in component memory and disappear when the payment panel unmounts after success.

Partial or zero payment is not a payment method. The `Allow remaining balance` control is visible only with approval access, is off by default, shows the due amount, and requires explicit confirmation. Backend authorization remains authoritative.

## Idempotent reliability

Payment content is normalized before submission. One idempotency key is retained for retries of the same payload, including uncertain network outcomes. Editing payment content creates a new key. Submission is disabled while in flight, while the server still provides payload-sensitive idempotency and cart locking.

## Permissions and security

The workspace requires POS read/create/update, sales create, and payment create access. Due sales require payment approval. Receipt actions require both receipt and payment read access. UI visibility is only guidance; API and application authorization enforce every operation.

The browser cannot submit organization, staff, role, permission, channel, price, total, allocation, reservation, or movement values. Unknown errors are friendly and include only a secondary request support reference.

## Accessibility and responsive behavior

Controls use visible labels, semantic forms and buttons, logical keyboard order, visible focus outlines, status announcements, and touch-sized quantity controls. Successful scans restore scanner focus. Payment validation focuses the first invalid field. Payment is an inline focused step, so Escape cannot silently discard entered references.

Desktop uses a main scanner/cart area with a sticky order summary. Tablet and mobile collapse to one column with a sticky payment summary, card-like cart rows, and no primary horizontal scrolling.

## Deferred scope

Gateways, card processing, mobile banking APIs, cash drawers, change calculation, discounts, tax, customer CRM, returns, refunds, offline synchronization, camera scanning, scanner SDKs, printer drivers, automatic printing, and AI integration remain outside this boundary. Existing browser receipt printing is reused.
