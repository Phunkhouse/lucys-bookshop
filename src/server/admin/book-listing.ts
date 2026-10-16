import { randomUUID } from 'node:crypto'
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
import { bookGenres, bookImages, books, genres } from '@/server/db/schema'
import { generateShortId } from '@/server/short-id'
import type { ObjectStorage } from '@/server/storage/object-storage'
import { removeImages } from '@/server/storage/remove-images'
import {
  clearStaging,
  copyNewPhotos,
  discardNewPhotos,
  photosOf,
  preparePhotos,
  sameOrder,
  type PlannedPhoto,
  type StoredPhoto,
} from './book-photos'

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

// A photo as the edit form needs it to show it.
export type StoredPhotoView = {
  imageId: string
  baseKey: string
  width: number
  height: number
}

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

type ListingOptions = {
  generateShortId?: () => string
  // Needed when the form carries photos. Where photos are kept.
  storage?: ObjectStorage
}

function requireStorage(options: ListingOptions): ObjectStorage {
  if (!options.storage) throw new Error('Photos need an object storage')
  return options.storage
}

const invalidPhotos = (error: string) =>
  ({
    ok: false,
    reason: 'invalid',
    errors: { photos: error },
  }) as const

export async function createListing(
  _actor: AdminActor,
  input: unknown,
  options: ListingOptions = {},
): Promise<CreateListingResult> {
  const parsed = parseBookForm(input)
  if (!parsed.ok) return { ok: false, reason: 'invalid', errors: parsed.errors }
  const { data } = parsed

  const genreIds = await genreIdsFor(db, data.genres)
  if (!genreIds) return unknownGenre

  // The id is chosen here, not by the database, because the photos' files are
  // put under it before the book row exists.
  const newBookId = randomUUID()
  let plan: PlannedPhoto[] = []
  let storage: ObjectStorage | undefined
  if (data.photos && data.photos.length > 0) {
    storage = requireStorage(options)
    const prepared = await preparePhotos({
      storage,
      bookId: newBookId,
      entries: data.photos,
      current: [],
    })
    if (!prepared.ok) return invalidPhotos(prepared.error)
    const copied = await copyNewPhotos(storage, prepared.plan)
    if (!copied.ok) return invalidPhotos(copied.error)
    plan = copied.plan
  }

  const makeShortId = options.generateShortId ?? generateShortId
  try {
    for (let attempt = 0; attempt < MAX_SHORT_ID_ATTEMPTS; attempt++) {
      const shortId = makeShortId()
      try {
        await db.transaction(async (tx) => {
          await tx.insert(books).values({
            ...bookColumns(data),
            id: newBookId,
            shortId,
            status: 'available',
          })
          if (genreIds.length > 0) {
            await tx
              .insert(bookGenres)
              .values(
                genreIds.map((genreId) => ({ bookId: newBookId, genreId })),
              )
          }
          if (plan.length > 0) {
            await tx.insert(bookImages).values(
              plan.map((planned, position) => ({
                id: planned.photo.id,
                bookId: newBookId,
                baseKey: planned.photo.baseKey,
                position,
                width: planned.photo.width,
                height: planned.photo.height,
              })),
            )
          }
        })
        if (storage) await clearStaging(storage, plan)
        return { ok: true, id: newBookId, shortId }
      } catch (error) {
        // 36^8 ids make this very rare. The unique constraint decides; try another.
        if (!isShortIdCollision(error)) throw error
      }
    }
    throw new Error('Could not find a free short id')
  } catch (error) {
    // Nothing was saved, so the files put in place for it are not wanted.
    if (storage) await discardNewPhotos(storage, plan)
    throw error
  }
}

export async function updateListing(
  _actor: AdminActor,
  id: string,
  input: unknown,
  options: ListingOptions = {},
): Promise<UpdateListingResult> {
  if (!bookId.safeParse(id).success) return { ok: false, reason: 'not_found' }

  const parsed = parseBookForm(input)
  if (!parsed.ok) return { ok: false, reason: 'invalid', errors: parsed.errors }
  const { data } = parsed

  const [exists] = await db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.id, id))
  if (!exists) return { ok: false, reason: 'not_found' }
  if (!(await genreIdsFor(db, data.genres))) return unknownGenre

  // Photos are checked and copied before the transaction, so the book's row is
  // not locked while the storage is slow. The transaction then checks again.
  let plan: PlannedPhoto[] | undefined
  let storage: ObjectStorage | undefined
  if (data.photos !== undefined) {
    const before = await photosOf(db, id)
    if (data.photos.length > 0 || before.length > 0) {
      storage = requireStorage(options)
    }
    const prepared = await preparePhotos({
      storage: storage ?? ({} as ObjectStorage),
      bookId: id,
      entries: data.photos,
      current: before,
    })
    if (!prepared.ok) return invalidPhotos(prepared.error)
    plan = prepared.plan
    if (storage) {
      const copied = await copyNewPhotos(storage, plan)
      if (!copied.ok) return invalidPhotos(copied.error)
      plan = copied.plan
    }
  }

  let removed: StoredPhoto[] = []
  let outcome: UpdateListingResult
  try {
    outcome = await db.transaction(async (tx): Promise<UpdateListingResult> => {
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

      const currentPhotos = await photosOf(tx, id)
      if (plan) {
        // A photo that was there a moment ago may be gone by now.
        const stillThere = new Set(currentPhotos.map((p) => p.id))
        if (
          plan.some((p) => p.kind === 'existing' && !stillThere.has(p.photo.id))
        ) {
          return invalidPhotos('photoInvalid')
        }
      }

      const currentGenres = await genreKeysOf(tx, id)
      const photosUnchanged = !plan || sameOrder(plan, currentPhotos)
      const unchanged =
        (
          Object.entries(bookColumns(data)) as [keyof typeof current, unknown][]
        ).every(([column, value]) => current[column] === value) &&
        sameSet(currentGenres, data.genres) &&
        photosUnchanged
      // Nothing to write, so "last changed" keeps telling the truth.
      if (unchanged) return { ok: true, outcome: 'unchanged' }

      await tx.update(books).set(bookColumns(data)).where(eq(books.id, id))
      await tx.delete(bookGenres).where(eq(bookGenres.bookId, id))
      if (genreIds.length > 0) {
        await tx
          .insert(bookGenres)
          .values(genreIds.map((genreId) => ({ bookId: id, genreId })))
      }

      if (plan && !photosUnchanged) {
        // The rows are written again in the new order: positions are unique per
        // book, so moving them one by one would collide halfway.
        await tx.delete(bookImages).where(eq(bookImages.bookId, id))
        if (plan.length > 0) {
          await tx.insert(bookImages).values(
            plan.map((planned, position) => ({
              id: planned.photo.id,
              bookId: id,
              baseKey: planned.photo.baseKey,
              position,
              width: planned.photo.width,
              height: planned.photo.height,
            })),
          )
        }
        const kept = new Set(plan.map((p) => p.photo.id))
        removed = currentPhotos.filter((p) => !kept.has(p.id))
      }
      return { ok: true, outcome: 'changed' }
    })
  } catch (error) {
    if (storage && plan) await discardNewPhotos(storage, plan)
    throw error
  }

  if (storage && plan) {
    if (outcome.ok && outcome.outcome === 'changed') {
      // Saved: the old files and the staging copies are not needed any more.
      await removeImages(
        storage,
        removed.map((p) => p.baseKey),
      )
      await clearStaging(storage, plan)
    } else {
      // Not saved: the copies made for it are not wanted.
      await discardNewPhotos(storage, plan)
    }
  }
  return outcome
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
): Promise<{
  id: string
  values: BookFormValues
  photos: StoredPhotoView[]
} | null> {
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
    photos: (await photosOf(db, id)).map((photo) => ({
      imageId: photo.id,
      baseKey: photo.baseKey,
      width: photo.width,
      height: photo.height,
    })),
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
