# ADR-074: User Identity Separation

## Status

Accepted

## Decision

Represent system users independently from organization membership. A `User` stores globally unique email identity and lifecycle status. Organization-specific access lives in membership records.

## Rationale

The same person can operate in multiple organizations. Keeping user identity separate from membership avoids duplicating users per tenant and gives lifecycle controls that can lock a user globally without changing organization records.

## Consequences

Email uniqueness is global. Organization access requires a membership lookup. Authentication mechanisms remain outside this foundation.
