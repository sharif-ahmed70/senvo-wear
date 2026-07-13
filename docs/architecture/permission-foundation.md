# Permission Foundation

SENVO Wear authorization now has a permission foundation for future authenticated application flows. It is intentionally separate from authentication transport.

## Model

Permissions are data records defined by:

- `resource`: `ORGANIZATION`, `USER`, `CATALOG`, `INVENTORY`, `RESERVATION`, `SALES_ORDER`, or `REPORT`
- `action`: `CREATE`, `READ`, `UPDATE`, `DELETE`, `APPROVE`, `CANCEL`, or `FULFILL`

The `(resource, action)` pair is unique. Permissions carry lifecycle status so operational policy can be disabled without deleting rows.

## Role Mapping

`RolePermission` maps an identity role to a permission. The initial default policy is also represented in domain code as data so authorization can run before a database-backed policy administration workflow exists.

Initial intent:

- `OWNER`: all permissions
- `ADMIN`: organization management, catalog, inventory, and sales permissions
- `MANAGER`: inventory, reservation, and sales operational permissions
- `STAFF`: read access and limited reservation and sales order operational permissions

## Authorization Service

The authorization service accepts trusted application context and a requested permission. It denies access when:

- the user is inactive or locked
- the organization membership is inactive
- the user has no membership for the organization
- the context role does not match the membership role
- the role does not grant the requested permission

## Application Boundary

Application services can receive an authorization hook. This foundation demonstrates the pattern on one sales operation and one inventory operation without adding authentication, HTTP routes, sessions, cookies, or frontend behavior.
