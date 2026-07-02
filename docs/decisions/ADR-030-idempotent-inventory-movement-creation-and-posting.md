# ADR-030: Idempotent Inventory Movement Creation and Posting

## Status

Accepted

## Context

Network retries and concurrent duplicate requests must not duplicate ledger effects.

## Decision

`organizationId + idempotencyKey` is unique for movement creation. The movement stores a deterministic payload signature. Same key and same payload return the existing movement. Same key and different payload fail.

Posting the same movement more than once returns the posted result and does not create additional ledger lines.

## Consequences

Callers can retry safely. Conflicting reuse of idempotency keys is detected explicitly.
