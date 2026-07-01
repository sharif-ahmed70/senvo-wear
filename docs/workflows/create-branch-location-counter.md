# Create Branch Location Counter

1. Create or select an organization.
2. Create a branch with a unique organization-scoped code.
3. Create stock locations under that branch.
4. Create POS counters under that branch.

The application use cases validate names, codes, country code, timezone, optional contact fields, reference existence, duplicate codes, and same-organization ownership before creating records.

The database remains the final integrity boundary:

- branch codes are unique within an organization
- stock location codes are unique within an organization
- POS counter codes are unique within an organization
- stock locations and POS counters cannot reference a branch from another organization

No inventory quantity or POS sale state is created by this workflow.
