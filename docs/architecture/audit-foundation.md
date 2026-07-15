# Audit Foundation

## Purpose

SENVO Wear records selected business actions through a transport-independent audit writer. The initial integration covers sales order creation and inventory movement posting.

## Runtime flow

Application services validate an `ApplicationContext` containing the request, actor, organization, role, permissions, and authentication state. After a selected business operation succeeds, the service sends an organization-scoped record to `AuditWriter`.

The domain owns audit actions, resources, metadata safety validation, and the repository contract. The database package implements persistence. HTTP, session, and logging concerns are outside this boundary.

## Persistence

`audit_entries` stores an application-generated UUID, organization, optional user, controlled action and resource values, resource UUID, JSON metadata, and creation time. Entries have no update or delete repository operation. Organization and user references use restrictive foreign keys.

## Current consistency boundary

Audit writing is composed beside the existing repositories. Cross-repository transaction coordination is deferred; callers must treat an audit-write failure as an operation failure even though the business repository may already have committed.
