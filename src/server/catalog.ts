import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { displayStatus } from './availability'
import { isAvailableSql, isListedSql } from './availability-sql'
import { db } from './db/client'
import { bookGenres, bookImages, books, genres } from './db/schema'

// What a visitor can see. Hidden books never reach these types.
export type PublicStatus = 'available' | 'reserved' | 'sold'

export type ImageRef = { baseKey: string; width: number; height: number }

type BookSummary = {
  shortId: string
  title: string
  author: string
  priceMinor: number
  currency: string
  condition: 'like_new' | 'used'
  language: string
  status: PublicStatus
  genres: string[]
}

export type CatalogItem = BookSummary & { cover: ImageRef | null }

export type BookDetail = BookSummary & {
  isbn: string | null
  description: string
  conditionNote: string | null
  soldAt: Date | null
  images: ImageRef[]
}

const SHORT_ID_PATTERN = /^[0-9a-z]{6,8}$/

// Genre keys per book, sorted. Separate queries (not joins) keep one row per book.
async function genreKeysByBook(bookIds: string[]) {
  const rows = await db
    .select({ bookId: bookGenres.bookId, key: genres.key })
    .from(bookGenres)
    .innerJoin(genres, eq(genres.id, bookGenres.genreId))
    .where(inArray(bookGenres.bookId, bookIds))
    .orderBy(asc(genres.key))
  const byBook = new Map<string, string[]>()
  for (const row of rows) {
    byBook.set(row.bookId, [...(byBook.get(row.bookId) ?? []), row.key])
  }
  return byBook
}

// Images per book in display order (lowest position first).
async function imagesByBook(bookIds: string[]) {
  const rows = await db
    .select()
    .from(bookImages)
    .where(inArray(bookImages.bookId, bookIds))
    .orderBy(asc(bookImages.position))
  const byBook = new Map<string, ImageRef[]>()
  for (const row of rows) {
    const image = { baseKey: row.baseKey, width: row.width, height: row.height }
    byBook.set(row.bookId, [...(byBook.get(row.bookId) ?? []), image])
  }
  return byBook
}

// Listed books for the catalog grid: available first, then the rest, each group
// newest first. Short id breaks ties so the order is stable.
export async function listCatalog(now: Date): Promise<CatalogItem[]> {
  const rows = await db
    .select()
    .from(books)
    .where(isListedSql(now))
    .orderBy(
      sql`CASE WHEN ${isAvailableSql(now)} THEN 0 ELSE 1 END`,
      desc(books.createdAt),
      asc(books.shortId),
    )
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const [genreKeys, images] = await Promise.all([
    genreKeysByBook(ids),
    imagesByBook(ids),
  ])

  return rows.map((row) => ({
    shortId: row.shortId,
    title: row.title,
    author: row.author,
    priceMinor: row.priceMinor,
    currency: row.currency,
    condition: row.condition,
    language: row.language,
    status: displayStatus(row, now) as PublicStatus,
    genres: genreKeys.get(row.id) ?? [],
    cover: images.get(row.id)?.[0] ?? null,
  }))
}

// One book for the detail page. Hidden or unknown books give null (the page
// answers 404). Sold books of any age are returned, so shared links keep working.
export async function getBookByShortId(
  shortId: string,
  now: Date,
): Promise<BookDetail | null> {
  if (!SHORT_ID_PATTERN.test(shortId)) return null

  const [row] = await db
    .select()
    .from(books)
    .where(and(eq(books.shortId, shortId), ne(books.status, 'hidden')))
  if (!row) return null

  const [genreKeys, images] = await Promise.all([
    genreKeysByBook([row.id]),
    imagesByBook([row.id]),
  ])

  return {
    shortId: row.shortId,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    description: row.description,
    conditionNote: row.conditionNote,
    priceMinor: row.priceMinor,
    currency: row.currency,
    condition: row.condition,
    language: row.language,
    status: displayStatus(row, now) as PublicStatus,
    soldAt: row.soldAt,
    genres: genreKeys.get(row.id) ?? [],
    images: images.get(row.id) ?? [],
  }
}
