# 0005. Testing setup: Vitest

Date: 2026-10-05
Status: accepted
Milestone: M0

## Context

The service layer in `src/server/` needs fast unit tests. `pnpm test` is part of the checks run before finishing, so it should stay quick and not need a database.

## Decision

Use Vitest with the `node` environment, running `src/**/*.test.ts`. `pnpm test` runs `vitest run` and stays DB-free. Tests that need a database will be kept separate and added later. The config file is `vitest.config.mts`, because the `.mts` extension avoids an ESM warning.

## Alternatives considered

- Jest: slower and needs extra setup.

## Consequences

- `pnpm test` runs `vitest run`; `pnpm test:watch` runs `vitest`.
- The `@/*` alias works in tests through `resolve.tsconfigPaths` (see 0004).
- Don't add database access to the tests `pnpm test` runs. The reservation race-condition test needs a real Postgres, so it goes in the separate DB suite, which doesn't exist yet.
- Playwright for end-to-end flows is not set up yet.
