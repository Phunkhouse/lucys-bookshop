import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  parseBookForm,
  type BookData,
  type BookFormErrors,
  type BookFormValues,
} from '@/lib/book-form-schema'
import { formatPriceInput } from '@/lib/price'
import type { AdminActor } from '@/server/auth/require-admin'
import { db } from '@/server/db/client'
import { bookGenres, books, genres } from '@/server/db/schema'
import { generateShortId } from '@/server/short-id'

export type CreateListingResult =
  | { ok: true; id: string; shortId: string }
  | { ok: false; reason: 'invalid'; errors: BookFormErrors }

export type UpdateListingResult =
  | { ok: true; outcome: 'changed' | 'unchanged' }
  | { ok: false; reason: 'invalid'; errors: BookFormErrors }
  | { ok: false; reason: 'not_found' }

const bookId = z.uuid()
const MAX_SHORT_ID_ATTEMPTS = 5

type Executor = Pick<typeof db, 'select'>

// The fields of a book this form owns. Short id, status, reservation and sold
// date are never written here (status has its own toggle, spec 6.9).
function bookColumns(data: BookData) {
  return {
    title: data.title,
    author: data.author,
    language: data.language,
    condition: data.condition,
    conditionNote: data.conditionNote,
    description: data.description,
    priceMinor: data.priceMinor,
    isbn: data.isbn,
  }
}

// Genre ids for the given keys, or null when one of them does not exist.
async function genreIdsFor(executor: Executor, keys: string[]) {
  if (keys.length === 0) return []
  const rows = await executor
    .select({ id: genres.id })
    .from(genres)
    .where(inArray(genres.key, keys))
  return rows.length === keys.length ? rows.map((r) => r.id) : null
}

const unknownGenre = {
  ok: false,
  reason: 'invalid',
  errors: { genres: 'unknownGenre' },
} as const

function isShortIdCollision(error: unknown): boolean {
  // Drizzle wraps the driver error, so look at the cause as well.
  for (
    let e = error as
      { code?: string; constraint?: string; cause?: unknown } | undefined;
    e;
    e = e.cause as typeof e
  ) {
    if (e.code === '23505' && e.constraint?.includes('short_id')) return true
  }
  return false
}

export async function createListing(
  _actor: AdminActor,
  input: unknown,
  options: { generateShortId?: () => string } = {},
): Promise<CreateListingResult> {
  const parsed = parseBookForm(input)
  if (!parsed.ok) return { ok: false, reason: 'invalid', errors: parsed.errors }
  const { data } = parsed

  const genreIds = await genreIdsFor(db, data.genres)
  if (!genreIds) return unknownGenre

  const makeShortId = options.generateShortId ?? generateShortId
  for (let attempt = 0; attempt < MAX_SHORT_ID_ATTEMPTS; attempt++) {
    const shortId = makeShortId()
    try {
      const id = await db.transaction(async (tx) => {
        const [book] = await tx
          .insert(books)
          .values({ ...bookColumns(data), shortId, status: 'available' })
          .returning({ id: books.id })
        if (genreIds.length > 0) {
          await tx
            .insert(bookGenres)
            .values(genreIds.map((genreId) => ({ bookId: book.id, genreId })))
        }
        return book.id
      })
      return { ok: true, id, shortId }
    } catch (error) {
      // 36^8 ids make this very rare. The unique constraint decides; try another.
      if (!isShortIdCollision(error)) throw error
    }
  }
  throw new Error('Could not find a free short id')
}

export async function updateListing(
  _actor: AdminActor,
  id: string,
  input: unknown,
): Promise<UpdateListingResult> {
  if (!bookId.safeParse(id).success) return { ok: false, reason: 'not_found' }

  const parsed = parseBookForm(input)
  if (!parsed.ok) return { ok: false, reason: 'invalid', errors: parsed.errors }
  const { data } = parsed

  return db.transaction(async (tx): Promise<UpdateListingResult> => {
    // Locked until the end of the transaction, so the comparison below and the
    // write see the same row.
    const [current] = await tx
      .select()
      .from(books)
      .where(eq(books.id, id))
      .for('update')
    if (!current) return { ok: false, reason: 'not_found' }

    const genreIds = await genreIdsFor(tx, data.genres)
    if (!genreIds) return unknownGenre

    const currentGenres = await genreKeysOf(tx, id)
    const unchanged =
      (
        Object.entries(bookColumns(data)) as [keyof typeof current, unknown][]
      ).every(([column, value]) => current[column] === value) &&
      sameSet(currentGenres, data.genres)
    // Nothing to write, so "last changed" keeps telling the truth.
    if (unchanged) return { ok: true, outcome: 'unchanged' }

    await tx.update(books).set(bookColumns(data)).where(eq(books.id, id))
    await tx.delete(bookGenres).where(eq(bookGenres.bookId, id))
    if (genreIds.length > 0) {
      await tx
        .insert(bookGenres)
        .values(genreIds.map((genreId) => ({ bookId: id, genreId })))
    }
    return { ok: true, outcome: 'changed' }
  })
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((key) => b.includes(key))
}

async function genreKeysOf(executor: Executor, id: string) {
  const rows = await executor
    .select({ key: genres.key })
    .from(bookGenres)
    .innerJoin(genres, eq(genres.id, bookGenres.genreId))
    .where(eq(bookGenres.bookId, id))
    .orderBy(asc(genres.key))
  return rows.map((r) => r.key)
}

// The edit form's starting values. Any book, hidden ones included.
export async function getListingForEdit(
  _actor: AdminActor,
  id: string,
): Promise<{ id: string; values: BookFormValues } | null> {
  if (!bookId.safeParse(id).success) return null

  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, id)))
  if (!book) return null

  return {
    id: book.id,
    values: {
      title: book.title,
      author: book.author,
      genres: await genreKeysOf(db, id),
      language: book.language,
      condition: book.condition,
      conditionNote: book.conditionNote ?? '',
      description: book.description,
      price: formatPriceInput(book.priceMinor),
      isbn: book.isbn ?? '',
    },
  }
}

// Genre keys for the form's checkboxes. Genres are public data, so no actor.
export async function listGenreKeys(): Promise<string[]> {
  const rows = await db
    .select({ key: genres.key })
    .from(genres)
    .orderBy(asc(genres.key))
  return rows.map((r) => r.key)
}
