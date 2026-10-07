import 'dotenv/config' // must stay first: loads .env before anything reads the env
import { sql } from 'drizzle-orm'
import { db, pool } from '../src/server/db/client'

async function main() {
  const result = await db.execute(sql`select version()`)
  console.log(result.rows[0])
  await pool.end()
}

main()