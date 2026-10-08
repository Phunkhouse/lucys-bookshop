# 0010. Database integration tests: separate Vitest project

Date: 2026-10-08
Status: accepted
Milestone: M1

## Context

M1 adds catalog queries whose rules live in SQL (effective availability, sold within 14 days, ordering). Mocks can't catch a wrong join or `WHERE`. M3 needs a real Postgres for the reservation race-condition test. `pnpm test` must stay database-free (see 0005), and the project runs on free tiers only. Docker Postgres exists locally, and the CI `check` job already has a Postgres service container.

## Decision

Add a third Vitest project, `integration`, for `src/**/*.int.test.ts` (node environment), run by its own script `pnpm test:db`. Each run creates a throwaway database on the existing Postgres, applies the real migrations, runs the tests and drops the database. Tests reset data by truncating tables, not by recreating the database. CI runs `pnpm test:db` in the existing `check` job.

## Alternatives considered

- In-memory Postgres (pglite): not real Postgres, and the race-condition test needs the real thing, so we would keep two setups.
- Testcontainers: starts a container per run, which is heavier when a Postgres already exists locally and in CI.
- Tests against Neon: uses free-tier quota, needs network and secrets, and is slower.

## Consequences

- `pnpm test` and `pnpm check` are unchanged and need no database. `pnpm test:db` needs `pnpm db:up` locally.
- The dev database and its seed data are never touched.
- Every run applies the migrations from scratch, so a broken migration fails the tests.
- The setup itself is added in the catalog service PR, where it is first needed. Note 0005 says the DB suite "doesn't exist yet"; this note supersedes that line once the setup lands.
