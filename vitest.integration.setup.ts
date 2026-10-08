import { afterAll, inject } from 'vitest'

// Point the app's database client at the throwaway database. This runs before
// any test file imports src/server/db/client.
process.env.DATABASE_URL = inject('testDatabaseUrl')

afterAll(async () => {
  const { pool } = await import('@/server/db/client')
  await pool.end()
})
