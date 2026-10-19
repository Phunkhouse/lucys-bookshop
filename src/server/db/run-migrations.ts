import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'

type Timeouts = {
  // Giving up on a database that does not answer (a compute that is not awake).
  connectMs: number
  // Giving up on the lock another run holds, or a table another transaction holds.
  lockMs: number
  // Giving up on one statement that runs too long.
  statementMs: number
}

type RunMigrationsOptions = {
  // The direct (non-pooler) address: a session lock does not survive a pooler.
  connectionString: string
  migrationsFolder: string
  timeouts?: Partial<Timeouts>
}

// Without limits a stuck build would hang until Vercel's 45 minutes are gone.
// A migration is seconds of work at this size, so these are generous.
const DEFAULT_TIMEOUTS: Timeouts = {
  connectMs: 30_000,
  lockMs: 2 * 60_000,
  statementMs: 10 * 60_000,
}

// Names the lock, so two builds that migrate at the same moment take turns.
export const MIGRATION_LOCK_KEY = 'lucys-bookshop:migrations'

// The migrations this build has that the database does not show as applied.
// One-way on purpose: the database may know more than this build (an older
// commit is rebuilt, a rollback is redeployed), which is fine.
export function missingMigrations(
  local: string[],
  applied: string[],
): string[] {
  const known = new Set(applied)
  return local.filter((name) => !known.has(name))
}

// The migration folders of a build, in the order they are applied.
function localMigrationNames(migrationsFolder: string): string[] {
  return readdirSync(migrationsFolder)
    .filter((name) => existsSync(join(migrationsFolder, name, 'migration.sql')))
    .sort((a, b) => a.localeCompare(b))
}

async function appliedNames(client: Client): Promise<string[]> {
  const exists = await client.query(
    "select to_regclass('drizzle.__drizzle_migrations') as t",
  )
  if (exists.rows[0].t === null) return []
  const { rows } = await client.query(
    'select name from drizzle.__drizzle_migrations',
  )
  return rows.map((row) => row.name).filter((name) => name !== null)
}

// Applies the migrations that are still pending (ADR 0019), with the same
// bookkeeping table as `pnpm db:migrate`, so the two always agree. All pending
// migrations run in one transaction: one that fails leaves the database as it
// was. A session lock makes a second run wait for the first, then find nothing
// left to do. Nothing waits forever. Afterwards every migration of this build is
// checked to be recorded as applied, so none can be skipped without a word.
// Errors say what failed, never the connection string.
export async function runMigrations({
  connectionString,
  migrationsFolder,
  timeouts,
}: RunMigrationsOptions): Promise<{ applied: number }> {
  const limits = { ...DEFAULT_TIMEOUTS, ...timeouts }
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: limits.connectMs,
  })
  try {
    await client.connect()
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string }
    const why =
      code ?? (/timeout/i.test(message ?? '') ? 'timed out' : 'unknown error')
    throw new Error(`Could not connect to the migration database (${why})`)
  }

  try {
    // Session settings: they apply to the lock below and to the migrations.
    await client.query("select set_config('lock_timeout', $1, false)", [
      `${limits.lockMs}ms`,
    ])
    await client.query("select set_config('statement_timeout', $1, false)", [
      `${limits.statementMs}ms`,
    ])
    await client.query('select pg_advisory_lock(hashtext($1))', [
      MIGRATION_LOCK_KEY,
    ])

    const before = (await appliedNames(client)).length
    await migrate(drizzle({ client }), { migrationsFolder })

    const applied = await appliedNames(client)
    const missing = missingMigrations(
      localMigrationNames(migrationsFolder),
      applied,
    )
    if (missing.length > 0) {
      throw new Error(`Migrations were not applied: ${missing.join(', ')}`)
    }
    return { applied: applied.length - before }
  } catch (error) {
    // 55P03: lock_not_available, our own lock_timeout.
    if ((error as { code?: string }).code === '55P03') {
      throw new Error(
        `Gave up waiting for a lock after ${limits.lockMs / 1000} s: another migration run, or a transaction, holds it. Try again.`,
      )
    }
    throw error
  } finally {
    // Closing the connection also gives the lock back, even after a failure.
    await client.end().catch(() => undefined)
  }
}
