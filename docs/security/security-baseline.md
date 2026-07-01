# Security Baseline

Secrets must remain outside Git. `.env.example` documents variable names only. Logging must avoid passwords, tokens, payment secrets, and sensitive customer data.

Client applications may only expose variables intentionally prefixed with `NEXT_PUBLIC_`. Server-only packages such as database access must not be imported into client components.

Dependency audits should run before release work. Breaking upgrades must be reviewed instead of automatically forced.
