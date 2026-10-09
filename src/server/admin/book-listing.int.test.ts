import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { getBookByShortId, listCatalog } from '@/server/catalog'
import { db } from '@/server/db/client'
import { bookGenres, books, genres } from '@/server/db/schema'
import {
  createBook,
  createGenre,
  linkGenre,
  resetDatabase,
} from '@/server/db/test-helpers'
import { createListing, getListingForEdit, updateListing } from './book-listing'

const now = new Date('2026-10-09T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const longAgo = new Date('2026-01-01T00:00:00.000Z')

const input = {
  title: 'Stíny nad Vltavou',
  author: 'Marta Hrubešová',
  genres: ['crime', 'novel'],
  language: 'cs',
  condition: 'used',
  conditionNote: '',
  description: 'Detektivka z Prahy.',
  price: '189,50',
  isbn: '',
}

async function load(id: string) {
  const [row] = await db.select().from(books).where(eq(books.id, id))
  return row
}

async function genreKeysOf(bookId: string) {
  const rows = await db
    .select({ key: genres.key })
    .from(bookGenres)
    .innerJoin(genres, eq(genres.id, bookGenres.genreId))
    .where(eq(bookGenres.bookId, bookId))
  return rows.map((r) => r.key).sort()
}

beforeEach(async () => {
  await resetDatabase()
  for (const key of ['crime', 'novel', 'scifi']) await createGenre(key)
})

describe('createListing', () => {
  it('saves an available book, and it shows up in the shop without photos', async () => {
    const actor = await testActor()

    const result = await createListing(actor, input)

    if (!result.ok) throw new Error('expected the listing to be created')
    expect(result.shortId).toMatch(/^[0-9a-z]{8}$/)
    const row = await load(result.id)
    expect(row).toMatchObject({
      shortId: result.shortId,
      title: 'Stíny nad Vltavou',
      author: 'Marta Hrubešová',
      language: 'cs',
      condition: 'used',
      conditionNote: null,
      description: 'Detektivka z Prahy.',
      priceMinor: 18950,
      currency: 'CZK',
      status: 'available',
      reservedUntil: null,
      soldAt: null,
      isbn: null,
    })
    const catalog = await listCatalog(now)
    expect(catalog.map((b) => b.shortId)).toEqual([result.shortId])
    expect(catalog[0].cover).toBeNull()
  })

  it('links the chosen genres', async () => {
    const actor = await testActor()

    const result = await createListing(actor, input)

    if (!result.ok) throw new Error('expected the listing to be created')
    expect(await genreKeysOf(result.id)).toEqual(['crime', 'novel'])
  })

  it('saves a book without genres', async () => {
    const actor = await testActor()

    const result = await createListing(actor, { ...input, genres: [] })

    if (!result.ok) throw new Error('expected the listing to be created')
    expect(await genreKeysOf(result.id)).toEqual([])
  })

  it('rejects an unknown genre and saves nothing', async () => {
    const actor = await testActor()

    const result = await createListing(actor, {
      ...input,
      genres: ['crime', 'nope'],
    })

    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      errors: { genres: 'unknownGenre' },
    })
    expect(await db.select().from(books)).toHaveLength(0)
    expect(await db.select().from(bookGenres)).toHaveLength(0)
  })

  it('validates on the server and reports errors per field without writing', async () => {
    const actor = await testActor()

    const result = await createListing(actor, {
      ...input,
      title: '',
      price: 'abc',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      errors: { title: 'required', price: 'priceInvalid' },
    })
    expect(await db.select().from(books)).toHaveLength(0)
  })

  it('ignores status and other fields it does not own', async () => {
    const actor = await testActor()

    const result = await createListing(actor, {
      ...input,
      status: 'sold',
      shortId: 'hacked01',
      soldAt: '2020-01-01',
    })

    if (!result.ok) throw new Error('expected the listing to be created')
    const row = await load(result.id)
    expect(row.status).toBe('available')
    expect(row.shortId).not.toBe('hacked01')
    expect(row.soldAt).toBeNull()
  })

  it('tries another short id when one is taken', async () => {
    const actor = await testActor()
    await createBook({ shortId: 'takenid1' })
    const candidates = ['takenid1', 'takenid1', 'freshid1']

    const result = await createListing(actor, input, {
      generateShortId: () => candidates.shift()!,
    })

    expect(result).toMatchObject({ ok: true, shortId: 'freshid1' })
    expect(await db.select().from(books)).toHaveLength(2)
  })

  it('gives up cleanly when every short id is taken, leaving nothing behind', async () => {
    const actor = await testActor()
    await createBook({ shortId: 'takenid1' })

    await expect(
      createListing(actor, input, { generateShortId: () => 'takenid1' }),
    ).rejects.toThrow()

    expect(await db.select().from(books)).toHaveLength(1)
    expect(await db.select().from(bookGenres)).toHaveLength(0)
  })
})

describe('updateListing', () => {
  it('updates the fields and replaces the genres, and moves updatedAt only', async () => {
    const actor = await testActor()
    const book = await createBook({
      title: 'Old title',
      priceMinor: 10000,
      createdAt: longAgo,
      updatedAt: longAgo,
    })
    const crime = (
      await db.select().from(genres).where(eq(genres.key, 'crime'))
    )[0]
    await linkGenre(book.id, crime.id)
    await linkGenre(
      book.id,
      (await db.select().from(genres).where(eq(genres.key, 'novel')))[0].id,
    )

    const result = await updateListing(actor, book.id, {
      ...input,
      title: 'New title',
      price: '250',
      genres: ['novel', 'scifi'],
    })

    expect(result).toEqual({ ok: true, outcome: 'changed' })
    const row = await load(book.id)
    expect(row).toMatchObject({ title: 'New title', priceMinor: 25000 })
    expect(row.createdAt).toEqual(longAgo)
    expect(row.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime())
    expect(await genreKeysOf(book.id)).toEqual(['novel', 'scifi'])
  })

  it('never changes short id, status, reservation or sold date, even if sent', async () => {
    const actor = await testActor()
    const book = await createBook({
      status: 'reserved',
      reservedUntil: new Date(now.getTime() + HOUR),
    })

    await updateListing(actor, book.id, {
      ...input,
      status: 'available',
      shortId: 'hacked01',
      reservedUntil: null,
      soldAt: '2020-01-01',
    })

    const row = await load(book.id)
    expect(row.shortId).toBe(book.shortId)
    expect(row.status).toBe('reserved')
    expect(row.reservedUntil).toEqual(book.reservedUntil)
    expect(row.soldAt).toBeNull()
  })

  it.each([
    ['hidden', {}],
    ['reserved', { reservedUntil: new Date(now.getTime() + HOUR) }],
    ['sold', { soldAt: new Date(now.getTime() - DAY) }],
  ] as const)(
    'edits a %s book without changing its status',
    async (status, extra) => {
      const actor = await testActor()
      const book = await createBook({ status, ...extra })

      const result = await updateListing(actor, book.id, {
        ...input,
        price: '300',
      })

      expect(result).toEqual({ ok: true, outcome: 'changed' })
      const row = await load(book.id)
      expect(row.status).toBe(status)
      expect(row.priceMinor).toBe(30000)
      expect(row.reservedUntil).toEqual(book.reservedUntil)
      expect(row.soldAt).toEqual(book.soldAt)
    },
  )

  it('answers not_found for an unknown or malformed id', async () => {
    const actor = await testActor()

    for (const id of ['5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50', 'not-a-uuid']) {
      expect(await updateListing(actor, id, input)).toEqual({
        ok: false,
        reason: 'not_found',
      })
    }
  })

  it('rolls back everything when a genre is unknown', async () => {
    const actor = await testActor()
    const book = await createBook({ title: 'Old title' })
    await linkGenre(
      book.id,
      (await db.select().from(genres).where(eq(genres.key, 'crime')))[0].id,
    )

    const result = await updateListing(actor, book.id, {
      ...input,
      title: 'New title',
      genres: ['novel', 'nope'],
    })

    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      errors: { genres: 'unknownGenre' },
    })
    expect((await load(book.id)).title).toBe('Old title')
    expect(await genreKeysOf(book.id)).toEqual(['crime'])
  })

  it('keeps the old link working after a title change', async () => {
    const actor = await testActor()
    const book = await createBook({ title: 'Old title' })

    await updateListing(actor, book.id, { ...input, title: 'Brand new title' })

    const found = await getBookByShortId(book.shortId, now)
    expect(found?.title).toBe('Brand new title')
  })

  it('does not move updatedAt when nothing changed', async () => {
    const actor = await testActor()
    const book = await createBook({
      title: 'Same',
      author: 'Same Author',
      priceMinor: 18900,
      updatedAt: longAgo,
    })
    const edit = await getListingForEdit(actor, book.id)
    if (!edit) throw new Error('expected the book to be found')

    const result = await updateListing(actor, book.id, edit.values)

    expect(result).toEqual({ ok: true, outcome: 'unchanged' })
    expect((await load(book.id)).updatedAt).toEqual(longAgo)
  })
})

describe('getListingForEdit', () => {
  it('returns the form values for any book, hidden ones included', async () => {
    const actor = await testActor()
    const book = await createBook({
      status: 'hidden',
      title: 'Stíny',
      author: 'Autor',
      language: 'en',
      condition: 'like_new',
      conditionNote: 'Bez poznámek',
      description: 'Popis',
      priceMinor: 18950,
      isbn: '9780306406157',
    })
    await linkGenre(
      book.id,
      (await db.select().from(genres).where(eq(genres.key, 'scifi')))[0].id,
    )

    const edit = await getListingForEdit(actor, book.id)

    expect(edit).toEqual({
      id: book.id,
      values: {
        title: 'Stíny',
        author: 'Autor',
        genres: ['scifi'],
        language: 'en',
        condition: 'like_new',
        conditionNote: 'Bez poznámek',
        description: 'Popis',
        price: '189,50',
        isbn: '9780306406157',
      },
    })
  })

  it('returns null for an unknown or malformed id', async () => {
    const actor = await testActor()

    expect(
      await getListingForEdit(actor, '5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50'),
    ).toBeNull()
    expect(await getListingForEdit(actor, 'not-a-uuid')).toBeNull()
  })
})
