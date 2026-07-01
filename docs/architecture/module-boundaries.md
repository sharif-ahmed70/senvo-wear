# Module Boundaries

Application packages may consume shared packages through package exports only. Deep imports across package internals are not allowed.

The domain package must stay independent from React, Next.js, Prisma, storage providers, and transport DTO assumptions. Contracts define API-facing shapes. Database code owns persistence access. UI components must remain business-agnostic.

Run `pnpm boundary:check` to enforce the most important forbidden dependency directions.
