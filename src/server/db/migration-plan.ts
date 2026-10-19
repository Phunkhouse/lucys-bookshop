// Decides whether a build migrates the database (ADR 0019). Pure: it only reads
// the environment it is given. The one place the rule lives.

export type MigrationPlan =
  | {
      action: 'skip'
      // not_production: a preview, local or CI build. switch: the emergency
      // switch is on.
      reason: 'not_production' | 'switch'
    }
  | { action: 'migrate'; connectionString: string }

type Env = Record<string, string | undefined>

// Only a production build migrates: previews share the production database
// until they get their own Neon branch, so a preview must never change it.
//
// A production build that cannot migrate is an error and stops the build, so
// new code never goes live on an old schema. The emergency switch
// (SKIP_DEPLOY_MIGRATIONS=1, exactly that) is the way out when the database is
// down and a code-only fix has to go live.
//
// The errors name the setting and never repeat its value.
export function planMigration(env: Env): MigrationPlan {
  if (env.VERCEL_ENV !== 'production') {
    return { action: 'skip', reason: 'not_production' }
  }
  if (env.SKIP_DEPLOY_MIGRATIONS === '1') {
    return { action: 'skip', reason: 'switch' }
  }

  const connectionString = (env.MIGRATION_DATABASE_URL ?? '').trim()
  if (connectionString === '') {
    throw new Error(
      'MIGRATION_DATABASE_URL is not set. A production build migrates the database before the new version goes live, so it needs the direct (non-pooler) address in the Production environment. To deploy without migrating in an emergency, set SKIP_DEPLOY_MIGRATIONS=1.',
    )
  }

  let protocol: string
  try {
    protocol = new URL(connectionString).protocol
  } catch {
    protocol = ''
  }
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error(
      'MIGRATION_DATABASE_URL must be a postgres:// or postgresql:// address.',
    )
  }
  return { action: 'migrate', connectionString }
}
