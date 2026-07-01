# Testing Strategy

The foundation uses Vitest for lightweight unit tests and Turborepo for workspace orchestration.

Current tests prove shared package consumption and helper behavior. Future milestones should add tests at the package boundary where behavior is introduced, then app-level tests for user workflows.

Boundary checks are part of the quality gate through `pnpm boundary:check`. Database environment behavior, API contracts, and error serialization have focused unit tests.
