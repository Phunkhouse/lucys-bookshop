import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { isAvailableSql } from '@/server/availability-sql'
import { testActor } from '@/server/auth/test-helpers'
import { db } from '@/server/db/client'
import { books } from '@/server/db/schema'
import { createBook, resetDatabase } from '@/server/db/test-helpers'
import { setBookHidden } from './book-status'

const now = new Date('2026-10-09T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const longAgo = new Date('2026-01-01T00:00:00.000Z')

async function load(id: string) {
  const [row] = await db.select().from(books).where(eq(books.id, id))
  return row
}

beforeEach(resetDatabase)

describe('hiding a book', () => {
  it('hides an available book and moves updatedAt forward', async () => {
    const actor = await testActor()
    const book = await createBook({ status: 'available', updatedAt: longAgo })

    const result = await setBookHidden(actor, book.id, true, now)

    expect(result).toEqual({ outcome: 'changed' })
    const row = await load(book.id)
    expect(row.status).toBe('hidden')
    expect(row.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime())
  })

  it('hides a book whose reservation has expired and clears the old deadline', async () => {
    const actor = await testActor()
    const book = await createBook({
      status: 'reserved',
      reservedUntil: at(-HOUR),
    })

    const result = await setBookHidden(actor, book.id, true, now)

    expect(result).toEqual({ outcome: 'changed' })
    const row = await load(book.id)
    expect(row.status).toBe('hidden')
    expect(row.reservedUntil).toBeNull()
  })

  it('treats a reservation ending exactly now as still reserved, and 1 ms later as expired', async () => {
    const actor = await testActor()
    const atDeadline = await createBook({
      status: 'reserved',
      reservedUntil: at(0),
    })
    const justExpired = await createBook({
      status: 'reserved',
      reservedUntil: at(-1),
    })

    expect(await setBookHidden(actor, atDeadline.id, true, now)).toEqual({
      outcome: 'refused',
      reason: 'reserved',
    })
    expect(await setBookHidden(actor, justExpired.id, true, now)).toEqual({
      outcome: 'changed',
    })
  })

  it('refuses an actively reserved book and leaves the row unchanged', async () => {
    const actor = await testActor()
    const book = await createBook({
      status: 'reserved',
      reservedUntil: at(HOUR),
      updatedAt: longAgo,
    })

    const result = await setBookHidden(actor, book.id, true, now)

    expect(result).toEqual({ outcome: 'refused', reason: 'reserved' })
    expect(await load(book.id)).toEqual(book)
  })

  it('refuses a sold book (its shared link must keep working) and leaves the row unchanged', async () => {
    const actor = await testActor()
    const book = await createBook({
      status: 'sold',
      soldAt: at(-3 * DAY),
      updatedAt: longAgo,
    })

    const result = await setBookHidden(actor, book.id, true, now)

    expect(result).toEqual({ outcome: 'refused', reason: 'sold' })
    expect(await load(book.id)).toEqual(book)
  })

  it('answers unchanged for an already hidden book and does not touch updatedAt', async () => {
    const actor = await testActor()
    const book = await createBook({ status: 'hidden', updatedAt: longAgo })

    const result = await setBookHidden(actor, book.id, true, now)

    expect(result).toEqual({ outcome: 'unchanged' })
    expect((await load(book.id)).updatedAt).toEqual(longAgo)
  })

  it('answers not_found for an unknown or malformed id, without throwing', async () => {
    const actor = await testActor()

    for (const id of [
      '5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50',
      'not-a-uuid',
      '',
    ]) {
      expect(await setBookHidden(actor, id, true, now)).toEqual({
        outcome: 'refused',
        reason: 'not_found',
      })
    }
  })
})

describe('unhiding a book', () => {
  it('makes a hidden book available again', async () => {
    const actor = await testActor()
    const book = await createBook({ status: 'hidden', updatedAt: longAgo })

    const result = await setBookHidden(actor, book.id, false, now)

    expect(result).toEqual({ outcome: 'changed' })
    const row = await load(book.id)
    expect(row.status).toBe('available')
    expect(row.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime())
  })

  it('answers unchanged for an available book', async () => {
    const actor = await testActor()
    const book = await createBook({ status: 'available', updatedAt: longAgo })

    expect(await setBookHidden(actor, book.id, false, now)).toEqual({
      outcome: 'unchanged',
    })
    expect(await load(book.id)).toEqual(book)
  })

  it('refuses reserved and sold books and leaves them unchanged', async () => {
    const actor = await testActor()
    const reserved = await createBook({
      status: 'reserved',
      reservedUntil: at(HOUR),
    })
    const sold = await createBook({ status: 'sold', soldAt: at(-DAY) })

    expect(await setBookHidden(actor, reserved.id, false, now)).toEqual({
      outcome: 'refused',
      reason: 'reserved',
    })
    expect(await setBookHidden(actor, sold.id, false, now)).toEqual({
      outcome: 'refused',
      reason: 'sold',
    })
    expect(await load(reserved.id)).toEqual(reserved)
    expect(await load(sold.id)).toEqual(sold)
  })
})

// The M3 reservation will be a conditional UPDATE of this shape. Whoever gets
// there second must lose: a book is never both hidden and reserved, and the
// reservation is never silently overwritten.
describe('hiding while a buyer reserves the same book', () => {
  it('lets exactly one of the two win, every time', async () => {
    const actor = await testActor()

    for (let round = 0; round < 20; round++) {
      const book = await createBook({ status: 'available' })

      const [hide, reserved] = await Promise.all([
        setBookHidden(actor, book.id, true, now),
        db
          .update(books)
          .set({ status: 'reserved', reservedUntil: at(48 * HOUR) })
          .where(and(eq(books.id, book.id), isAvailableSql(now)))
          .returning({ id: books.id }),
      ])

      const hideWon = hide.outcome === 'changed'
      const reserveWon = reserved.length === 1
      expect(hideWon).not.toBe(reserveWon)

      const row = await load(book.id)
      expect(row.status).toBe(hideWon ? 'hidden' : 'reserved')
      if (reserveWon)
        expect(hide).toEqual({ outcome: 'refused', reason: 'reserved' })
    }
  })
})
