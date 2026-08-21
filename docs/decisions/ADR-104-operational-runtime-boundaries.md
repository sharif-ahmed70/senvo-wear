# ADR-104: Operational Runtime Boundaries

## Decision

Use one Node API runtime to compose existing handlers, use Admin `/pos/sell`
as the V1 billing terminal, persist opaque revocable employee sessions, and
place S3-compatible media behind the existing object-storage contract.

## Consequences

Business rules remain in existing domain/application layers. Browser context is
untrusted, POS logic is not duplicated, media provider policy stays outside the
catalog domain, and reporting is read-only. Deployment must supply database,
origin, media, and initial credential configuration.
