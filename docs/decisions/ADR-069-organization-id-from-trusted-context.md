# ADR-069: Organization ID from Trusted Context

## Status

Accepted

## Decision

Sales application service inputs do not accept `organizationId`. The service injects `organizationId` from `ApplicationExecutionContext`.

## Rationale

Client-supplied organization identity is not trustworthy. Central context injection makes tenant scoping explicit and consistent across adapters.

## Consequences

Service input contracts reject `organizationId`. Domain use cases still receive `organizationId`, but only after the application boundary validates context.
