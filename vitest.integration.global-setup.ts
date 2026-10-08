import 'dotenv/config' // must stay first: loads .env so a local run finds DATABASE_URL
import { randomBytes } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import type { TestProject } from 'vitest/node'

// Tests create and drop databases, so only ever do that on a local server.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string
  }
}

// Creates a throwaway database on the server DATABASE_URL points at, applies the
// real migrations to it, and drops it when the run ends (see ADR 0010).
export default async function setup(project: TestProject) {
  const baseUrl = process.env.DATABASE_URL
  if (!baseUrl)
    throw new Error('DATABASE_URL is not set. Run pnpm db:up first.')

  const url = new URL(baseUrl)
  if (!LOCAL_HOSTS.includes(url.hostname)) {
    throw new Error(
      `Refusing to create a test database on ${url.hostname}: only a local server is allowed.`,
    )
  }

  const name = `bookshop_test_${randomBytes(4).toString('hex')}`
  const admin = new Pool({ connectionString: baseUrl, max: 1 })
  await admin.query(`CREATE DATABASE ${name}`)

  const testUrl = new URL(baseUrl)
  testUrl.pathname = `/${name}`

  const pool = new Pool({ connectionString: testUrl.toString(), max: 1 })
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: './drizzle' })
  } finally {
    await pool.end()
  }

  project.provide('testDatabaseUrl', testUrl.toString())

  return async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await admin.end()
  }
}
