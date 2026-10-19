# 0019. Migrate on deploy

Date: 2026-10-19
Status: accepted
Milestone: M5

## Context

Migrations were applied to Neon by hand before merging. That was missed twice (2026-10-17, and 2026-10-19 when a new column was added an hour after the merge, so checkout, which reads the settings table, could have failed in the gap). Vercel deploys on every merge to `main` and knows nothing about migrations. The budget is zero (Vercel Hobby, Neon free), and previews share the production database.

## Decision

Every **production** build migrates the database first, in the Vercel build: `vercel.json` sets the build command to `pnpm migrate:deploy && pnpm build`. The script (`scripts/migrate-on-deploy.ts`) uses drizzle's own migrator and the same bookkeeping table as `pnpm db:migrate`, takes a Postgres advisory lock, and runs all pending migrations in one transaction. If it fails, the build fails and the old deployment stays live. Only `VERCEL_ENV=production` migrates; previews, local and CI builds skip. A production build without `MIGRATION_DATABASE_URL` (the direct, non-pooler address) fails on purpose. `SKIP_DEPLOY_MIGRATIONS=1` is an emergency switch that skips with a loud warning.

Because the old version keeps serving while the build runs, migrations must be additive. A test (`migration-safety`) fails the build's CI on `DROP COLUMN/TABLE`, `RENAME`, `SET NOT NULL`, a type change, a required column without a default, `TRUNCATE` and `DELETE`, unless the file carries `-- allow-destructive: <reason>`. Removing something takes two changes: stop using it, then drop it.

## Alternatives considered

- Keep the manual step: it already failed twice.
- A GitHub Actions job before the deploy: Vercel deploys on its own, so the two race, and the job needs its own secrets.
- A dashboard build command override: not in the repository, easy to lose.
- `drizzle-kit migrate` in the build: no lock, and it needs a dev dependency and a config file in the build.
- Migrate previews too: they share the production database, so a preview of an unmerged PR would change it. A Neon branch per preview would allow it.

## Consequences

- Set `MIGRATION_DATABASE_URL` (Production only, sensitive) in Vercel **before** merging the PR that adds this, or its build fails. Runbook: `docs/migrations.md`.
- No human pause between merge and migration: CI applies every migration to a fresh database and runs the safety test; for a risky data change, take a Neon backup or branch first.
- Previews of a PR with a migration still break until it merges (unchanged).
- An Instant Rollback does not rebuild, so it does not migrate. Additive migrations keep older code working.
- To revisit: a separate database role with only DDL rights for migrations, and a Neon branch per preview deployment.
