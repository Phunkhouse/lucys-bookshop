import 'dotenv/config'
import { planMigration } from '../src/server/db/migration-plan'
import { runMigrations } from '../src/server/db/run-migrations'

// Runs before `next build` on Vercel (vercel.json, ADR 0019): applies pending
// migrations to the production database, so the new version never goes live on
// an old schema. Skipped for previews, local and CI builds. A failure stops the
// build and the old deployment stays live. Never prints the database address.
async function main() {
  const plan = planMigration(process.env)

  if (plan.action === 'skip') {
    if (plan.reason === 'switch') {
      console.warn(
        'migrate-on-deploy: SKIPPED by SKIP_DEPLOY_MIGRATIONS=1. The database was NOT migrated. Remove the switch and redeploy as soon as the database is reachable.',
      )
    } else {
      console.log('migrate-on-deploy: skipped (not a production build)')
    }
    return
  }

  const { applied } = await runMigrations({
    connectionString: plan.connectionString,
    migrationsFolder: './drizzle',
  })
  console.log(
    applied === 0
      ? 'migrate-on-deploy: nothing to apply, the database is up to date'
      : `migrate-on-deploy: applied ${applied} migration${applied === 1 ? '' : 's'}`,
  )
}

main().catch((error) => {
  console.error(
    'migrate-on-deploy: FAILED, the build is stopped:',
    error instanceof Error ? error.message : 'unknown error',
  )
  process.exitCode = 1
})
