# Online Payment Security Boundary

- The browser selects `CASH_ON_DELIVERY` or `ONLINE_PAYMENT`; it never supplies authoritative order amount, currency, tenant, actor, permissions, provider status, or settlement state.
- Storefront status and retry use an opaque high-entropy public token. Admin reads and actions use trusted execution context and `PAYMENT:READ` or `PAYMENT:APPROVE`.
- SSLCOMMERZ credentials are server-only. No credential uses a `NEXT_PUBLIC_*` name, enters audit metadata, or is returned by API contracts.
- SENVO accepts no PAN, CVV, OTP, or card form data. Customers enter payment details only on the provider-hosted HTTPS page.
- IPN bodies are bounded and form fields must be unique. Signature verification occurs before provider validation or internal state change.
- A signed success notification is still insufficient alone. SENVO calls the provider Order Validation API and compares provider transaction ID, amount, currency, validation reference, and risk state with internal facts.
- Success, fail, and cancel browser return URLs are presentation hints only. They query internal state and cannot mark an order paid.
- Notifications are database-deduplicated. Confirmation locks the attempt and a unique successful-attempt/settlement constraint prevents double capture.
- Raw provider payloads are not stored. Only bounded normalized references, statuses, dedupe signatures, and safe error codes are persisted.
- Payment never directly mutates stock. A late success after reservation loss is preserved as money truth and marked `REFUND_REQUIRED`.
