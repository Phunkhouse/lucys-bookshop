import { randomBytes } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATION_LOCK_KEY, runMigrations } from './run-migrations'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const REAL = join(process.cwd(), 'drizzle')

let admin: Pool
const created: string[] = []
const folders: string[] = []
const servers: Server[] = []

beforeAll(() => {
  const base = new URL(process.env.DATABASE_URL!)
  if (!LOCAL_HOSTS.includes(base.hostname)) {
    throw new Error('Refusing to create test databases on a non-local server.')
  }
  admin = new Pool({ connectionString: base.toString(), max: 1 })
})

afterAll(async () => {
  for (const name of created) {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  }
  await admin.end()
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
  for (const server of servers) server.close()
})

async function freshDatabase() {
  const name = `bookshop_mig_${randomBytes(4).toString('hex')}`
  await admin.query(`CREATE DATABASE ${name}`)
  created.push(name)
  const url = new URL(process.env.DATABASE_URL!)
  url.pathname = `/${name}`
  return url.toString()
}

function copyOfMigrations() {
  const folder = mkdtempSync(join(tmpdir(), 'bookshop-migrations-'))
  folders.push(folder)
  cpSync(REAL, folder, { recursive: true })
  return folder
}

function addMigration(folder: string, name: string, sql: string) {
  mkdirSync(join(folder, name))
  writeFileSync(join(folder, name, 'migration.sql'), sql)
}

async function tableExists(url: string, table: string) {
  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    const { rows } = await pool.query(
      'select 1 from information_schema.tables where table_name = $1',
      [table],
    )
    return rows.length > 0
  } finally {
    await pool.end()
  }
}

// What the reviewer of the migration runner asked about: a migration that is
// older by its timestamp than ones already applied, because its PR merged later.
// This drizzle version decides by name, not by date. The test pins that: if an
// upgrade changed it, the build would skip such a migration without a word.
describe('runMigrations: order of arrival', () => {
  it('applies a migration older than the latest applied one, which merged later', async () => {
    const url = await freshDatabase()
    await runMigrations({ connectionString: url, migrationsFolder: REAL })
    const folder = copyOfMigrations()
    addMigration(
      folder,
      '20200101000000_late_arrival',
      'CREATE TABLE "late_arrival" ("id" integer PRIMARY KEY);',
    )

    const result = await runMigrations({
      connectionString: url,
      migrationsFolder: folder,
    })

    expect(result).toEqual({ applied: 1 })
    expect(await tableExists(url, 'late_arrival')).toBe(true)
  })

  // An older commit is rebuilt, or a rollback is redeployed: the database has
  // migrations this build does not know. That must not be an error.
  it('is fine when the database knows more migrations than this build', async () => {
    const url = await freshDatabase()
    const newer = copyOfMigrations()
    addMigration(
      newer,
      '99990101000000_from_a_newer_build',
      'CREATE TABLE "from_newer" ("id" integer PRIMARY KEY);',
    )
    await runMigrations({ connectionString: url, migrationsFolder: newer })

    const result = await runMigrations({
      connectionString: url,
      migrationsFolder: REAL,
    })

    expect(result).toEqual({ applied: 0 })
  })
})

describe('runMigrations: it never waits forever', () => {
  it('gives up on a lock another run holds, and says so', async () => {
    const url = await freshDatabase()
    const holder = new Client({ connectionString: url })
    await holder.connect()
    await holder.query('select pg_advisory_lock(hashtext($1))', [
      MIGRATION_LOCK_KEY,
    ])
    try {
      const started = Date.now()

      const failure = await runMigrations({
        connectionString: url,
        migrationsFolder: REAL,
        timeouts: { lockMs: 400 },
      }).then(
        () => null,
        (error: unknown) => error,
      )

      expect(failure).toBeInstanceOf(Error)
      expect(String((failure as Error).message)).toMatch(/lock/i)
      expect(Date.now() - started).toBeLessThan(5000)
    } finally {
      await holder.end()
    }
  })

  it('goes ahead once the other run has finished', async () => {
    const url = await freshDatabase()
    const holder = new Client({ connectionString: url })
    await holder.connect()
    await holder.query('select pg_advisory_lock(hashtext($1))', [
      MIGRATION_LOCK_KEY,
    ])
    setTimeout(() => void holder.end(), 300)

    const result = await runMigrations({
      connectionString: url,
      migrationsFolder: REAL,
      timeouts: { lockMs: 5000 },
    })

    expect(result.applied).toBeGreaterThan(0)
  })

  it('gives up on a database that accepts the connection and never answers', async () => {
    const silent = createServer(() => {
      // Accepts and says nothing, like a compute that is not awake yet.
    })
    servers.push(silent)
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve))
    const { port } = silent.address() as { port: number }
    const started = Date.now()

    const failure = await runMigrations({
      connectionString: `postgres://user:secret-password@127.0.0.1:${port}/db`,
      migrationsFolder: REAL,
      timeouts: { connectMs: 300 },
    }).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(Error)
    expect(String((failure as Error).message)).toMatch(/connect/i)
    expect(String(failure)).not.toContain('secret-password')
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('stops a statement that runs too long, and leaves nothing behind', async () => {
    const url = await freshDatabase()
    const folder = mkdtempSync(join(tmpdir(), 'bookshop-migrations-'))
    folders.push(folder)
    addMigration(
      folder,
      '20260101000000_slow',
      'CREATE TABLE "before_slow" ("id" integer);\n--> statement-breakpoint\nSELECT pg_sleep(30);',
    )

    const failure = await runMigrations({
      connectionString: url,
      migrationsFolder: folder,
      timeouts: { statementMs: 500 },
    }).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(Error)
    expect(await tableExists(url, 'before_slow')).toBe(false)
  })
})
