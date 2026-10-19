import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from './run-migrations'

// Migrations are applied to databases made just for these tests, next to the
// throwaway one the other tests use, and dropped afterwards (ADR 0010).
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const REAL = join(process.cwd(), 'drizzle')
const realCount = readdirSync(REAL).filter((name) =>
  /^\d{14}_/.test(name),
).length

let admin: Pool
const created: string[] = []
const folders: string[] = []

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
})

async function freshDatabase() {
  const name = `bookshop_mig_${randomBytes(4).toString('hex')}`
  await admin.query(`CREATE DATABASE ${name}`)
  created.push(name)
  const url = new URL(process.env.DATABASE_URL!)
  url.pathname = `/${name}`
  return url.toString()
}

async function query<T = Record<string, unknown>>(url: string, sql: string) {
  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    return (await pool.query(sql)).rows as T[]
  } finally {
    await pool.end()
  }
}

const journal = (url: string) =>
  query<{ name: string }>(
    url,
    'select name from drizzle.__drizzle_migrations order by id',
  )

// A copy of the real migrations that tests can add to.
function copyOfMigrations() {
  const folder = mkdtempSync(join(tmpdir(), 'bookshop-migrations-'))
  folders.push(folder)
  cpSync(REAL, folder, { recursive: true })
  return folder
}

beforeEach(() => undefined)

describe('runMigrations', () => {
  it('applies every migration to an empty database, and nothing the second time', async () => {
    const url = await freshDatabase()

    const first = await runMigrations({
      connectionString: url,
      migrationsFolder: REAL,
    })
    const second = await runMigrations({
      connectionString: url,
      migrationsFolder: REAL,
    })

    expect(first).toEqual({ applied: realCount })
    expect(second).toEqual({ applied: 0 })
    expect(await journal(url)).toHaveLength(realCount)
    const tables = await query<{ table_name: string }>(
      url,
      "select table_name from information_schema.tables where table_name = 'orders'",
    )
    expect(tables).toHaveLength(1)
  })

  it('applies only what is new to a database that is already migrated', async () => {
    const url = await freshDatabase()
    await runMigrations({ connectionString: url, migrationsFolder: REAL })
    const folder = copyOfMigrations()
    mkdirSync(join(folder, '99990101000000_add_probe'))
    writeFileSync(
      join(folder, '99990101000000_add_probe', 'migration.sql'),
      'CREATE TABLE "probe" ("id" integer PRIMARY KEY);',
    )

    const result = await runMigrations({
      connectionString: url,
      migrationsFolder: folder,
    })

    expect(result).toEqual({ applied: 1 })
    expect((await journal(url)).at(-1)?.name).toBe('99990101000000_add_probe')
  })

  // The lock is what makes two production builds at the same moment safe.
  it('is safe when several runs start together: each migration is applied once', async () => {
    const url = await freshDatabase()

    const results = await Promise.all(
      [1, 2, 3].map(() =>
        runMigrations({ connectionString: url, migrationsFolder: REAL }),
      ),
    )

    expect(results.reduce((sum, r) => sum + r.applied, 0)).toBe(realCount)
    expect(await journal(url)).toHaveLength(realCount)
  })

  it('fails on a broken migration, leaves nothing half applied, and lets the next run through', async () => {
    const url = await freshDatabase()
    await runMigrations({ connectionString: url, migrationsFolder: REAL })
    const folder = copyOfMigrations()
    const broken = join(folder, '99990101000000_broken')
    mkdirSync(broken)
    writeFileSync(
      join(broken, 'migration.sql'),
      'CREATE TABLE "half_done" ("id" integer);\n--> statement-breakpoint\nSELECT * FROM "table_that_does_not_exist";',
    )

    await expect(
      runMigrations({ connectionString: url, migrationsFolder: folder }),
    ).rejects.toThrow()

    expect(await journal(url)).toHaveLength(realCount)
    const half = await query(
      url,
      "select 1 from information_schema.tables where table_name = 'half_done'",
    )
    expect(half).toHaveLength(0)

    // The failed run gave the lock back: a good run goes through at once.
    rmSync(broken, { recursive: true })
    await expect(
      runMigrations({ connectionString: url, migrationsFolder: folder }),
    ).resolves.toEqual({ applied: 0 })
  })

  it('applies nothing at all when a later migration of the same run is broken', async () => {
    const url = await freshDatabase()
    const folder = mkdtempSync(join(tmpdir(), 'bookshop-migrations-'))
    folders.push(folder)
    for (const [name, sql] of [
      ['20260101000000_first', 'CREATE TABLE "first_table" ("id" integer);'],
      ['20260101000001_second', 'SELECT * FROM "no_such_table";'],
    ]) {
      mkdirSync(join(folder, name))
      writeFileSync(join(folder, name, 'migration.sql'), sql)
    }

    await expect(
      runMigrations({ connectionString: url, migrationsFolder: folder }),
    ).rejects.toThrow()

    const tables = await query(
      url,
      "select 1 from information_schema.tables where table_name = 'first_table'",
    )
    expect(tables).toHaveLength(0)
  })

  // Developers keep using pnpm db:migrate locally: the two must agree on what is
  // applied, or one of them would apply a migration twice.
  it('agrees with drizzle-kit migrate about what is already applied', async () => {
    const url = await freshDatabase()
    execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    })

    const result = await runMigrations({
      connectionString: url,
      migrationsFolder: REAL,
    })

    expect(result).toEqual({ applied: 0 })
    expect(await journal(url)).toHaveLength(realCount)
  })

  it('leaves a database that it migrated for drizzle-kit migrate to find up to date', async () => {
    const url = await freshDatabase()
    await runMigrations({ connectionString: url, migrationsFolder: REAL })

    expect(() =>
      execFileSync('pnpm', ['exec', 'drizzle-kit', 'migrate'], {
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
      }),
    ).not.toThrow()
    expect(await journal(url)).toHaveLength(realCount)
  })

  it('names the problem without the connection string when it cannot connect', async () => {
    const url = new URL(await freshDatabase())
    url.password = 'secret-password-for-the-test'
    url.port = '1' // nothing listens here

    const failure = await runMigrations({
      connectionString: url.toString(),
      migrationsFolder: REAL,
    }).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).not.toContain('secret-password-for-the-test')
  })
})
