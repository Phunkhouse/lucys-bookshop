import { sql } from 'drizzle-orm'
import { db } from './client'

// Empties every table between integration tests. Cascade covers the join tables.
export async function resetDatabase() {
  await db.execute(
    sql`TRUNCATE TABLE books, genres, book_genres, book_images RESTART IDENTITY CASCADE`,
  )
}
