# Migrations

How the database schema changes reach production (ADR 0019). Everything here uses invented example values. Never put a real database address in the repo, in an issue or in a PR.

## Changing the schema

1. Edit `src/server/db/schema.ts`.
2. `pnpm db:generate -- --name=what_it_does` writes the migration into `drizzle/`. Never write SQL into the database by hand, and never use `drizzle-kit push`.
3. `pnpm db:migrate` applies it to your local database.
4. Open a PR. CI applies every migration to a fresh database and runs the tests, including the safety test below.
5. Merge. **Nothing else to do**: the production build migrates Neon before the new version goes live.

## The rule: only add

While the build runs, the old version still serves traffic against the already migrated database, so a migration must be one the old code survives. Adding a table, a nullable column, a column with a default or an index is fine. The safety test fails on removing or tightening: `DROP COLUMN/TABLE`, `RENAME`, `SET NOT NULL`, a column type change, a required column without a default, `TRUNCATE`, `DELETE`.

To remove something, do it in two PRs: first stop using it in the code and let that deploy, then drop it in a later migration. If the second one is really safe, put this comment on a line of its own in the migration, with the reason:

```sql
-- allow-destructive: nothing has read this column since PR 123
```

## Setup in Vercel (once)

Add `MIGRATION_DATABASE_URL` to **Production** only, marked Sensitive: the Neon **direct** (non-pooler) address, with `?sslmode=verify-full` (ADR 0009). Do it before merging the PR that introduced this, because a production build without it fails on purpose. Your normal `DATABASE_URL` stays as it is.

## What a build prints

In the Vercel build log of a production build, before the Next.js build:

- `migrate-on-deploy: nothing to apply, the database is up to date`
- `migrate-on-deploy: applied 1 migration`
- `migrate-on-deploy: FAILED, the build is stopped: ...` and the old deployment stays live. Read the message, fix the migration, push again.

Previews, local and CI builds print `skipped (not a production build)`.

## Emergency: the database is down and a code fix must go live

Set `SKIP_DEPLOY_MIGRATIONS` to `1` (exactly `1`) in the Production environment and redeploy. The build prints a warning that the database was **not** migrated. Remove the variable and redeploy as soon as the database is back, otherwise the next migration is skipped too.

## A risky migration

Merging applies it at once. Before merging a data change that is hard to undo, take a Neon backup or branch.
