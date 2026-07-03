# ADR-070: Centralized Application Validation, Output, and Error Mapping

## Status

Accepted

## Decision

Application services own adapter payload validation, output contract mapping, and public error taxonomy mapping.

## Rationale

Adapters should not duplicate schema parsing, output redaction, or domain error translation. Centralizing this behavior keeps customer-facing behavior stable across future transports.

## Consequences

Sales service results use `ok` result objects. Internal fields such as idempotency keys and payload signatures are omitted from service outputs.
