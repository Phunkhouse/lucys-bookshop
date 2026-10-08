import 'dotenv/config' // must stay first: loads .env before anything reads the env
import { inArray, sql } from 'drizzle-orm'
import { env } from '../src/config/env'
import { db, pool } from '../src/server/db/client'
import { SEED_GENRES, buildSeedBooks } from '../src/server/db/seed-data'
import { bookGenres, books, genres } from '../src/server/db/schema'

// Seed data is invented. Refuse to write it anywhere but a local database.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

async function main() {
  const { hostname } = new URL(env.DATABASE_URL)
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(
      `Refusing to seed ${hostname}: only a local database is allowed.`,
    )
  }

  const rows = buildSeedBooks(new Date())

  await db.transaction(async (tx) => {
    await tx
      .insert(genres)
      .values([...SEED_GENRES])
      .onConflictDoUpdate({
        target: genres.key,
        set: { slug: sql`excluded.slug` },
      })
    const genreRows = await tx.select().from(genres)
    const genreId = new Map(genreRows.map((g) => [g.key, g.id]))

    for (const { genres: genreKeys, ...book } of rows) {
      const [saved] = await tx
        .insert(books)
        .values(book)
        .onConflictDoUpdate({
          target: books.shortId,
          set: { ...book, updatedAt: new Date() },
        })
        .returning({ id: books.id })

      await tx.delete(bookGenres).where(inArray(bookGenres.bookId, [saved.id]))
      await tx.insert(bookGenres).values(
        genreKeys.map((key) => ({
          bookId: saved.id,
          genreId: genreId.get(key)!,
        })),
      )
    }
  })

  console.log(`Seeded ${rows.length} books and ${SEED_GENRES.length} genres.`)
  await pool.end()
}

main().catch(async (error) => {
  console.error(error)
  await pool.end()
  process.exit(1)
})
