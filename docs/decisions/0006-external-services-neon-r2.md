# 0006. External services: Neon and R2

Date: 2026-10-05
Status: accepted
Milestone: M0

## Context

The shop needs a hosted Postgres database now and file storage later. CLAUDE.md rules out Vercel-only features (Blob, Edge Config, Vercel Cron, image optimization), so these services must work outside Vercel.

## Decision

Use Neon only as a Postgres host, in the Frankfurt region. Don't use Neon Auth, Neon storage or Neon functions. Use R2 for storage, but defer it to M2.

## Consequences

- The app talks to Neon as plain Postgres through Drizzle, so moving to another Postgres host should not need code changes.
- No Neon Auth, storage or functions: nothing else in the app should depend on them.
- Schema changes still go only through generated migrations.
- R2 is not set up in M0 or M1. Before M2, add it behind an interface, like the other integrations.
- No Neon or R2 settings exist in the repo yet: there is no `.env.example` and the spec doesn't mention them. Add the variable names to `.env.example` (never real values) when the services are wired up.
