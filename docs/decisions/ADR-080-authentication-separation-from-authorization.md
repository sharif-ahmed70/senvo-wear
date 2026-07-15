# ADR-080: Authentication Separation From Authorization

## Status

Accepted

## Context

SENVO Wear already has identity, membership, roles, permissions, and authorization. Future authenticated access needs a way to identify the user without mixing provider logic into permission checks.

## Decision

Authentication answers who the user is and produces an authenticated principal. Authorization remains responsible for organization access and permission decisions.

## Consequences

Provider-specific login flows can be added later without weakening organization isolation or spreading permission checks into authentication code. This does not add login UI, JWT, cookies, sessions, or API routes.
