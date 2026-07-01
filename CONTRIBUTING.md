# Contributing

## Branch Naming

Use short, descriptive branches such as `feat/domain-contract-foundation`, `fix/database-config`, or `docs/security-baseline`.

## Commit Convention

Use conventional commit prefixes where practical: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.

## Pull Requests

Every pull request should explain the change, list verification commands, identify migration impact, and call out security or environment changes.

## Quality Gates

Before review, run:

```sh
pnpm format:check
pnpm lint
pnpm boundary:check
pnpm typecheck
pnpm test:run
pnpm db:validate
pnpm db:generate
pnpm build
```

## Migration Rules

Database schema changes require Prisma migrations generated locally, reviewed in the pull request, and applied through controlled deployment. Do not use `prisma db push` in production. Development-only `db push` requires an explicit local acknowledgement and a configured `DATABASE_URL`.

## Documentation Requirements

Architecture-affecting changes need documentation updates. Durable technical decisions need an ADR in `docs/decisions`.

## No-Secret Policy

Never commit credentials, private keys, tokens, real payment data, or customer data. Use `.env.example` for variable names only.

## Codex Self-Review Expectations

Codex-authored changes must include a final self-review covering scope, tests run, known limitations, and any commands that could not complete.
