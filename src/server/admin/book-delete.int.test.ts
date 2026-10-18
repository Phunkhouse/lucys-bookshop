import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { db } from '@/server/db/client'
import {
  bookGenres,
  bookImages,
  books,
  genres,
  orderItems,
} from '@/server/db/schema'
import {
  addImage,
  createBook,
  createGenre,
  createOrder,
  linkGenre,
  resetDatabase,
} from '@/server/db/test-helpers'
import { deleteBook } from './book-delete'
import { setBookHidden } from './book-status'

const now = new Date('2026-10-16T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)

async function load(id: string) {
  const [row] = await db.select().from(books).where(eq(books.id, id))
  return row
}

describe('deleteBook', () => {
  it('deletes a hidden book with its genre links and photo rows, and nothing else', async () => {
    const actor = await testActor()
    const crime = await createGenre('crime')
    const novel = await createGenre('novel')
    const doomed = await createBook({ status: 'hidden' })
    await linkGenre(doomed.id, crime.id)
    await linkGenre(doomed.id, novel.id)
    await addImage(doomed.id, 0)
    await addImage(doomed.id, 1)
    const keeper = await createBook({ status: 'hidden' })
    await linkGenre(keeper.id, crime.id)
    await addImage(keeper.id, 0)

    const result = await deleteBook(actor, doomed.id, now)

    expect(result.outcome).toBe('deleted')
    expect(await load(doomed.id)).toBeUndefined()
    expect(await load(keeper.id)).toEqual(keeper)
    expect(
      (await db.select().from(bookGenres)).map((row) => row.bookId),
    ).toEqual([keeper.id])
    expect(
      (await db.select().from(bookImages)).map((row) => row.bookId),
    ).toEqual([keeper.id])
    // The genres themselves stay: they belong to the shop, not to the book.
    expect(await db.select().from(genres)).toHaveLength(2)
  })

  it('returns the storage keys of the photos, in order, so the files can be removed', async () => {
    const actor = await testActor()
    const withPhotos = await createBook({ status: 'hidden' })
    await addImage(withPhotos.id, 1)
    await addImage(withPhotos.id, 0)
    const withoutPhotos = await createBook({ status: 'hidden' })

    expect(await deleteBook(actor, withPhotos.id, now)).toEqual({
      outcome: 'deleted',
      imageKeys: [`books/${withPhotos.id}/img0`, `books/${withPhotos.id}/img1`],
    })
    expect(await deleteBook(actor, withoutPhotos.id, now)).toEqual({
      outcome: 'deleted',
      imageKeys: [],
    })
  })

  it.each([
    ['an available book', { status: 'available' }, 'not_hidden'],
    [
      'a book whose reservation has expired (it counts as available)',
      { status: 'reserved', reservedUntil: at(-HOUR) },
      'not_hidden',
    ],
    [
      'a reservation ending exactly now (still reserved)',
      { status: 'reserved', reservedUntil: at(0) },
      'reserved',
    ],
    [
      'an actively reserved book',
      { status: 'reserved', reservedUntil: at(HOUR) },
      'reserved',
    ],
    ['a book sold yesterday', { status: 'sold', soldAt: at(-DAY) }, 'sold'],
    [
      'a book sold long ago (its shared link must keep working)',
      { status: 'sold', soldAt: at(-100 * DAY) },
      'sold',
    ],
  ] as const)(
    'refuses %s and leaves everything in place',
    async (_name, fields, reason) => {
      const actor = await testActor()
      const genre = await createGenre('crime')
      const book = await createBook(fields)
      await linkGenre(book.id, genre.id)
      await addImage(book.id, 0)

      const result = await deleteBook(actor, book.id, now)

      expect(result).toEqual({ outcome: 'refused', reason })
      expect(await load(book.id)).toEqual(book)
      expect(await db.select().from(bookGenres)).toHaveLength(1)
      expect(await db.select().from(bookImages)).toHaveLength(1)
    },
  )

  it('refuses a hidden book that an order points at, and changes nothing', async () => {
    const actor = await testActor()
    const book = await createBook({ status: 'hidden' })
    await addImage(book.id, 0)
    const order = await createOrder({ status: 'cancelled' })
    await db.insert(orderItems).values({
      orderId: order.id,
      bookId: book.id,
      titleSnapshot: book.title,
      priceMinorSnapshot: book.priceMinor,
    })

    expect(await deleteBook(actor, book.id, now)).toEqual({
      outcome: 'refused',
      reason: 'has_orders',
    })
    expect(await load(book.id)).toBeDefined()
    expect(await db.select().from(bookImages)).toHaveLength(1)
  })

  it('answers not_found for an unknown or malformed id, without throwing', async () => {
    const actor = await testActor()

    for (const id of [
      '5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50',
      'not-a-uuid',
      '',
    ]) {
      expect(await deleteBook(actor, id, now)).toEqual({
        outcome: 'refused',
        reason: 'not_found',
      })
    }
  })

  it('answers not_found when the same book is deleted twice', async () => {
    const actor = await testActor()
    const book = await createBook({ status: 'hidden' })

    expect((await deleteBook(actor, book.id, now)).outcome).toBe('deleted')
    expect(await deleteBook(actor, book.id, now)).toEqual({
      outcome: 'refused',
      reason: 'not_found',
    })
  })
})

// Delete and "show again" both want a hidden book. Whoever is second must lose,
// and the book is never half deleted or both deleted and visible.
describe('deleting while the same book is shown again', () => {
  it('lets exactly one of the two win, every time', async () => {
    const actor = await testActor()

    for (let round = 0; round < 20; round++) {
      const book = await createBook({ status: 'hidden' })

      const [deleted, unhidden] = await Promise.all([
        deleteBook(actor, book.id, now),
        setBookHidden(actor, book.id, false, now),
      ])

      const deleteWon = deleted.outcome === 'deleted'
      const unhideWon = unhidden.outcome === 'changed'
      expect(deleteWon).not.toBe(unhideWon)

      if (deleteWon) {
        expect(await load(book.id)).toBeUndefined()
        expect(unhidden).toEqual({ outcome: 'refused', reason: 'not_found' })
      } else {
        expect((await load(book.id)).status).toBe('available')
        expect(deleted).toEqual({ outcome: 'refused', reason: 'not_hidden' })
      }
    }
  })
})
