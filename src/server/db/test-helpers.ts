import { sql } from 'drizzle-orm'
import { db } from './client'
import { bookGenres, bookImages, books, genres, orders } from './schema'

// Empties every table between integration tests. Cascade covers the join tables
// and the auth tables that reference the user.
export async function resetDatabase() {
  await db.execute(
    sql`TRUNCATE TABLE books, orders, order_items, order_counters, settings, genres, book_genres, book_images, "user", session, account, verification, rate_limit RESTART IDENTITY CASCADE`,
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

let orderCounter = 0

// Inserts an order with valid defaults. Pass only what the test cares about.
export async function createOrder(
  overrides: Partial<typeof orders.$inferInsert> = {},
) {
  orderCounter += 1
  const [order] = await db
    .insert(orders)
    .values({
      number: 20260000 + orderCounter,
      publicToken: `token-${orderCounter}`,
      paymentMethod: 'bank_transfer',
      email: 'buyer@example.com',
      name: 'Test Buyer',
      phone: '+420600000000',
      shippingMethod: 'pickup',
      shippingCostMinor: 0,
      totalMinor: 10000,
      expiresAt: new Date('2026-10-20T12:00:00.000Z'),
      ...overrides,
    })
    .returning()
  return order
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
