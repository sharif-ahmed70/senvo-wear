# ADR-073: Server-Only Application Package Boundary

## Status

Accepted

## Decision

`@senvo/application` is server-only and exposes a browser entry that throws if imported by browser bundles.

## Rationale

Application services may compose database repositories and must not be bundled into client-side code.

## Consequences

Boundary checks reject `@senvo/application` imports from UI packages and client modules. Browser bundlers resolve the package to an explicit throwing module.
