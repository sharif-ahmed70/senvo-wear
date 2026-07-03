# Sales Application Service Requirements

The sales application service provides the adapter-facing boundary for sales order workflows.

## Functional Requirements

1. Accept service input contracts that exclude `organizationId`.
2. Require or generate a request ID for every operation.
3. Validate `organizationId`, actor metadata, source, and request ID before calling domain use cases.
4. Inject trusted `organizationId` into every domain use case input.
5. Map domain sales orders to service contracts with ISO timestamps.
6. Exclude `idempotencyKey` and `payloadSignature` from service outputs.
7. Normalize validation, not found, conflict, idempotency conflict, concurrency, business rule, and internal errors.
8. Mark concurrency errors retryable.
9. Log safe metadata without customer names, phone numbers, emails, addresses, idempotency keys, payload signatures, stack traces, or SQL details.

## Non-Goals

No HTTP route, UI, authentication, payment, shipment, notification, or inventory algorithm change is included in this requirement.
