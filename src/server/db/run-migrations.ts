import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'

type RunMigrationsOptions = {
  // The direct (non-pooler) address: a session lock does not survive a pooler.
  connectionString: string
  migrationsFolder: string
}

// Names the lock, so two builds that migrate at the same moment take turns.
const LOCK_KEY = 'lucys-bookshop:migrations'

async function appliedCount(client: Client): Promise<number> {
  const exists = await client.query(
    "select to_regclass('drizzle.__drizzle_migrations') as t",
  )
  if (exists.rows[0].t === null) return 0
  const counted = await client.query(
    'select count(*)::int as n from drizzle.__drizzle_migrations',
  )
  return counted.rows[0].n
}

// Applies the migrations that are still pending (ADR 0019), with the same
// bookkeeping table as `pnpm db:migrate`, so the two always agree. All pending
// migrations run in one transaction: one that fails leaves the database as it
// was. A session lock makes a second run wait for the first, then find nothing
// left to do. Errors say what failed, never the connection string.
export async function runMigrations({
  connectionString,
  migrationsFolder,
}: RunMigrationsOptions): Promise<{ applied: number }> {
  const client = new Client({ connectionString })
  try {
    await client.connect()
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'unknown error'
    throw new Error(`Could not connect to the migration database (${code})`)
  }

  try {
    await client.query('select pg_advisory_lock(hashtext($1))', [LOCK_KEY])
    const before = await appliedCount(client)
    await migrate(drizzle({ client }), { migrationsFolder })
    return { applied: (await appliedCount(client)) - before }
  } finally {
    // Closing the connection also gives the lock back, even after a failure.
    await client.end().catch(() => undefined)
  }
}
