# 0007. Drizzle v1.0.0-rc.4

Date: 2026-10-06
Status: accepted
Milestone: M0

## Context
The project uses Drizzle with Postgres. Drizzle has a stable 0.x line (latest v0.45.3) and a 1.0 release candidate. There is no schema yet, so the choice costs nothing to make now.

## Decision
Use the v1 release candidate: `drizzle-orm` and `drizzle-kit` are both at `^1.0.0-rc.4` in `package.json`. The Drizzle docs list "v0 → v1 updates" and "Relational Queries v1 to v2" as upgrade guides, so a later move from 0.x to 1.x would be real work. Starting on v1 avoids it. The docs match the installed version, so their examples apply when the author or an agent reads them. It is also the current version the author will meet at work in a year.

## Alternatives considered
- Drizzle v0.45.3, the latest 0.x release: avoids a release candidate, but means the v0 → v1 migration later, with a schema and queries to move.

## Consequences
- Keep `drizzle-orm` and `drizzle-kit` on the same major version.
- Read the v1 docs. v0 examples and answers found online may not apply.
- Release candidates can change before 1.0 final. After upgrading either package, run `pnpm lint`, `pnpm typecheck` and `pnpm test`, and review any generated migration.
- Schema changes still go only through generated migrations.
- Revisit when 1.0 is released as stable.
