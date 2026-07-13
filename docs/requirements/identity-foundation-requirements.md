# Identity Foundation Requirements

## Scope

Provide the domain and persistence foundation for future authenticated users accessing SENVO Wear organizations.

## Functional Requirements

- The system must store users with globally unique email addresses.
- A user may belong to one or more organizations.
- Organization access must be controlled by membership.
- Membership must carry one role: `OWNER`, `ADMIN`, `MANAGER`, or `STAFF`.
- User lifecycle must support `ACTIVE`, `INACTIVE`, and `LOCKED`.
- Membership lifecycle must support `ACTIVE` and `INACTIVE`.
- Inactive or locked users must not access any organization.
- Inactive memberships must not access an organization.
- Users without membership in an organization must not access that organization.
- Duplicate memberships for the same user and organization must be prevented.

## Contract Requirements

- Contracts must validate create user, create membership, update membership status, and assign role inputs.
- Identity contracts must not include password, token, session, cookie, or OAuth fields.
- Role and lifecycle values must be strict enums.

## Persistence Requirements

- Migration must be additive.
- Previous migrations must remain unchanged.
- User deletion and organization deletion must be restricted while memberships reference them.
- Timestamps and version fields must be present for identity lifecycle records.

## Out of Scope

Login UI, OAuth, social login, JWT, sessions, cookies, NextAuth/Auth.js, API routes, frontend, password reset, email verification, payments, customer accounts, and POS login are not part of this task.
