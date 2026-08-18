# Online Payment Provider Architecture

SENVO owns order, reservation, settlement, refund, and audit truth. The provider adapter owns SSLCOMMERZ protocol details. Domain and application packages depend only on `OnlinePaymentProviderAdapter`; provider URLs, credentials, signatures, response fields, and status mapping remain in `@senvo/payment-provider`.

Checkout creates the canonical order and reservation first. An `OnlinePaymentAttempt` then records server-derived order, amount, currency, idempotency signature, provider transaction ID, and opaque public status token. Session creation is an external call outside the database transaction. A persisted `CREATED` attempt can therefore recover after timeout or response loss without recreating the order.

Confirmed provider money is appended through the existing `PaymentBatch` and `PaymentLine` settlement truth using `ONLINE_GATEWAY`. The POS context is nullable only for provider-backed batches; database checks require exactly one valid source. Provider refunds append the existing immutable `PaymentRefund` history only after confirmation.

External calls never run inside a database transaction. The internal confirmation path locks the payment attempt and performs order confirmation, settlement append, reconciliation, notification completion, and audit in one explicit outer transaction. Duplicate success is idempotent.

The first adapter uses SSLCOMMERZ hosted checkout. Adding another provider requires a new adapter and provider enum value, not provider fields in sales or inventory domain logic.
