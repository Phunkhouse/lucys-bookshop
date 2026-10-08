import { sql } from 'drizzle-orm'
import { db } from './client'
import { bookGenres, bookImages, books, genres } from './schema'

// Empties every table between integration tests. Cascade covers the join tables.
export async function resetDatabase() {
  await db.execute(
    sql`TRUNCATE TABLE books, genres, book_genres, book_images RESTART IDENTITY CASCADE`,
  )
}

let counter = 0

// Inserts a book with valid defaults. Pass only what the test cares about.
export async function createBook(
  overrides: Partial<typeof books.$inferInsert> = {},
) {
  counter += 1
  const [book] = await db
    .insert(books)
    .values({
      shortId: `t${String(counter).padStart(6, '0')}`,
      title: `Test book ${counter}`,
      author: 'Test Author',
      language: 'cs',
      condition: 'used',
      priceMinor: 10000,
      ...overrides,
    })
    .returning()
  return book
}

export async function createGenre(key: string) {
  const [genre] = await db.insert(genres).values({ key, slug: key }).returning()
  return genre
}

export async function linkGenre(bookId: string, genreId: string) {
  await db.insert(bookGenres).values({ bookId, genreId })
}

export async function addImage(bookId: string, position: number) {
  await db.insert(bookImages).values({
    bookId,
    baseKey: `books/${bookId}/img${position}`,
    position,
    width: 960,
    height: 1280,
  })
}
