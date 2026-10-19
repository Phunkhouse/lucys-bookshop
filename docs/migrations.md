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

## What the safety test does not catch

It reads the SQL, so it cannot know how the old code behaves. Review these by hand:

- **A new constraint** (`ADD CONSTRAINT` unique, check or foreign key, or `CREATE UNIQUE INDEX`) on a table the old code still writes to: its inserts can start failing. On a new table it is fine.
- **A bare `UPDATE`** is not flagged, because backfills are normal. Make sure it cannot lock a big table for long.
- **The word `rename`** as a column or value name is a false positive. Use the `-- allow-destructive: <reason>` comment.

## Things to know about how migrations run

- **One transaction for everything pending.** So `CREATE INDEX CONCURRENTLY` cannot be used, and a value added with `ALTER TYPE ... ADD VALUE` cannot be used in the same run (put its use in a later migration).
- **The name decides, not the date.** A migration whose timestamp is older than ones already applied (its PR merged later) is still applied, and a test pins this. If two open PRs each add a migration, the second to merge should regenerate it on top of the first, so they do not depend on a schema state the other changed.
- **Nothing waits forever.** The build gives up after 30 s without a connection (a Neon compute that is not awake), 2 minutes waiting for a lock, or 10 minutes on one statement. The old deployment stays live and the log says which one it was.
- **After the run, every migration of the build is checked to be recorded as applied.** The database may know more than the build (an older commit rebuilt, a rollback redeployed): that is fine.

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
