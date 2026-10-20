import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm'
import { displayStatus } from './availability'
import { isAvailableSql, isListedSql } from './availability-sql'
import { CATALOG_PAGE_SIZE, type CatalogQuery } from './catalog-query'
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
export async function imagesByBook(bookIds: string[]) {
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

export type CatalogPage = {
  items: CatalogItem[]
  // Every matching book, not only the ones on this page.
  total: number
  // The page shown: the requested one, or the last when it is past the end.
  page: number
  pageCount: number
}

// Czech alphabetical order ("Ch" after "H", "Č" after "C"). The database's own
// collation is not Czech. A migration checks that this collation exists.
const czech = (column: SQL | typeof books.title) =>
  sql`${column} COLLATE "cs-CZ-x-icu"`

const ISBN_PATTERN = /^(\d{13}|\d{9}[\dX])$/

// The text search treats the input as plain characters: LIKE wildcards and the
// escape character are escaped.
const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&')

// Search text conditions: an ISBN (10 or 13 digits, hyphens and spaces ignored)
// matches exactly, anything else must match every word, in the title, author
// or ISBN, ignoring accents and case. Same expression as the trigram index.
function searchCondition(q: string): SQL {
  const isbn = q.replace(/[-\s]/g, '').toUpperCase()
  if (ISBN_PATTERN.test(isbn)) return eq(books.isbn, isbn)

  const searchText = sql`catalog_search_text(${books.title}, ${books.author}, ${books.isbn})`
  const words = q
    .split(' ')
    .map(
      (word) =>
        sql`${searchText} LIKE '%' || lower(public.unaccent('public.unaccent'::regdictionary, ${escapeLike(word)})) || '%' ESCAPE '\\'`,
    )
  return and(...words)!
}

function catalogConditions(query: CatalogQuery, now: Date): SQL {
  const conditions: (SQL | undefined)[] = [isListedSql(now)]

  if (query.q) conditions.push(searchCondition(query.q))
  if (query.genres.length > 0) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${bookGenres}
      INNER JOIN ${genres} ON ${genres.id} = ${bookGenres.genreId}
      WHERE ${bookGenres.bookId} = ${books.id}
        AND ${inArray(genres.key, query.genres)}
    )`)
  }
  if (query.conditions.length > 0) {
    conditions.push(inArray(books.condition, query.conditions))
  }
  if (query.languages.length > 0) {
    conditions.push(inArray(books.language, query.languages))
  }
  if (query.minPriceMinor !== undefined) {
    conditions.push(gte(books.priceMinor, query.minPriceMinor))
  }
  if (query.maxPriceMinor !== undefined) {
    conditions.push(lte(books.priceMinor, query.maxPriceMinor))
  }
  if (query.onlyAvailable) conditions.push(isAvailableSql(now))

  return and(...conditions)!
}

// Available books always come first, then the chosen key, and the short id last
// so the order (and so the pages) is stable.
function catalogOrder(query: CatalogQuery, now: Date): SQL[] {
  const availableFirst = sql`CASE WHEN ${isAvailableSql(now)} THEN 0 ELSE 1 END`
  const tieBreak = asc(books.shortId)
  switch (query.sort) {
    case 'price-asc':
      return [availableFirst, asc(books.priceMinor), tieBreak]
    case 'price-desc':
      return [availableFirst, desc(books.priceMinor), tieBreak]
    case 'title':
      return [availableFirst, czech(books.title), tieBreak]
    case 'author':
      return [availableFirst, czech(books.author), czech(books.title), tieBreak]
    case 'newest':
      return [availableFirst, desc(books.createdAt), tieBreak]
  }
}

// One page of the listed books that match the query (spec 6.1, ADR 0022).
export async function listCatalog(
  query: CatalogQuery,
  now: Date,
): Promise<CatalogPage> {
  const where = catalogConditions(query, now)

  const [{ total }] = await db
    .select({ total: count() })
    .from(books)
    .where(where)
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE))
  const page = Math.min(query.page, pageCount)

  const rows =
    total === 0
      ? []
      : await db
          .select()
          .from(books)
          .where(where)
          .orderBy(...catalogOrder(query, now))
          .limit(CATALOG_PAGE_SIZE)
          .offset((page - 1) * CATALOG_PAGE_SIZE)
  if (rows.length === 0) return { items: [], total, page, pageCount }

  const ids = rows.map((r) => r.id)
  const [genreKeys, images] = await Promise.all([
    genreKeysByBook(ids),
    imagesByBook(ids),
  ])

  const items = rows.map((row) => ({
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
  return { items, total, page, pageCount }
}

// The genres and languages the filters offer: only those of books a visitor can
// see, so a choice never leads to an empty list by itself.
export async function catalogFilterOptions(now: Date) {
  const [genreRows, languageRows] = await Promise.all([
    db
      .selectDistinct({ key: genres.key })
      .from(genres)
      .innerJoin(bookGenres, eq(bookGenres.genreId, genres.id))
      .innerJoin(books, eq(books.id, bookGenres.bookId))
      .where(isListedSql(now))
      .orderBy(asc(genres.key)),
    db
      .selectDistinct({ language: books.language })
      .from(books)
      .where(isListedSql(now))
      .orderBy(asc(books.language)),
  ])
  return {
    genres: genreRows.map((r) => r.key),
    languages: languageRows.map((r) => r.language),
  }
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
