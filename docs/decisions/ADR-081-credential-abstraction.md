# ADR-081: Credential Abstraction

## Status

Accepted

## Context

SENVO Wear may support password, Google, Microsoft, or other identity providers later. The foundation must persist identity links without storing plaintext credentials or committing to a transport.

## Decision

Persist `UserCredential` records with provider, identifier, optional `passwordHash`, status, timestamps, and version. Provider and identifier are unique together. Password handling is represented by a `PasswordHasher` interface, not by a concrete implementation.

## Consequences

The system can enforce duplicate identity and lifecycle rules now while deferring provider implementations. Password input, reset, email verification, tokens, and sessions remain out of scope.
