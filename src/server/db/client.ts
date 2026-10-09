import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { databaseEnv } from '@/config/database-env'

// next dev reloads modules often. Cache the pool so each reload
// doesn't open a fresh set of connections.
const globalForDb = globalThis as unknown as { pool?: Pool }

export const pool =
  globalForDb.pool ??
  new Pool({ connectionString: databaseEnv.DATABASE_URL, max: 5 })
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool

export const db = drizzle({ client: pool })
