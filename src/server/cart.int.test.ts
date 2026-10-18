import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { bookImages } from '@/server/db/schema'
import { createBook, resetDatabase } from '@/server/db/test-helpers'
import { validateCart } from './cart'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)

const seenAt = (book: { shortId: string; priceMinor: number }) => ({
  shortId: book.shortId,
  priceMinorSeen: book.priceMinor,
})

describe('validateCart', () => {
  it('returns each line in the order the buyer added them, with the stored data', async () => {
    const first = await createBook({ title: 'First', priceMinor: 20000 })
    const second = await createBook({ title: 'Second', priceMinor: 5000 })

    const result = await validateCart([seenAt(second), seenAt(first)], now)

    expect(result.lines.map((l) => l.kind)).toEqual(['ok', 'ok'])
    expect(result.lines.map((l) => (l.kind === 'ok' ? l.title : null))).toEqual(
      ['Second', 'First'],
    )
    expect(result.subtotalMinor).toBe(25000)
    expect(result.currency).toBe('CZK')
  })

  it('classifies every state in one call and totals only the buyable books', async () => {
    const fine = await createBook({ priceMinor: 10000 })
    const repriced = await createBook({ priceMinor: 8000 })
    const reserved = await createBook({
      status: 'reserved',
      reservedUntil: at(HOUR),
    })
    const expired = await createBook({
      status: 'reserved',
      reservedUntil: at(-HOUR),
      priceMinor: 3000,
    })
    const sold = await createBook({ status: 'sold', soldAt: at(-HOUR) })
    const hidden = await createBook({ status: 'hidden' })

    const result = await validateCart(
      [
        seenAt(fine),
        { shortId: repriced.shortId, priceMinorSeen: 9000 },
        seenAt(reserved),
        seenAt(expired),
        seenAt(sold),
        seenAt(hidden),
        { shortId: 'zzzzzzzz', priceMinorSeen: 1 },
      ],
      now,
    )

    expect(result.lines.map((l) => l.kind)).toEqual([
      'ok',
      'price_changed',
      'unavailable',
      'ok',
      'unavailable',
      'gone',
      'gone',
    ])
    expect(result.subtotalMinor).toBe(10000 + 8000 + 3000)
  })

  it('takes prices from the database, never from what the browser sent', async () => {
    const book = await createBook({ priceMinor: 15000 })

    const result = await validateCart(
      [{ shortId: book.shortId, priceMinorSeen: 1 }],
      now,
    )

    expect(result.subtotalMinor).toBe(15000)
  })

  it('counts a book once when the list repeats it', async () => {
    const book = await createBook({ priceMinor: 15000 })

    const result = await validateCart([seenAt(book), seenAt(book)], now)

    expect(result.lines).toHaveLength(1)
    expect(result.subtotalMinor).toBe(15000)
  })

  it('gives each line its first photo as the cover, or none', async () => {
    const withPhoto = await createBook()
    const without = await createBook()
    await db.insert(bookImages).values([
      {
        bookId: withPhoto.id,
        baseKey: 'k/1',
        position: 1,
        width: 3,
        height: 4,
      },
      {
        bookId: withPhoto.id,
        baseKey: 'k/0',
        position: 0,
        width: 3,
        height: 4,
      },
    ])

    const result = await validateCart([seenAt(withPhoto), seenAt(without)], now)

    const [a, b] = result.lines
    expect(a.kind === 'ok' && a.cover?.baseKey).toBe('k/0')
    expect(b.kind === 'ok' && b.cover).toBeNull()
  })

  it('answers an empty cart without querying anything useful', async () => {
    expect(await validateCart([], now)).toEqual({
      lines: [],
      subtotalMinor: 0,
      currency: 'CZK',
    })
  })

  it('follows the catalog: a reserved book is unavailable here and reserved there', async () => {
    const reserved = await createBook({
      status: 'reserved',
      reservedUntil: at(HOUR),
    })

    const [line] = (await validateCart([seenAt(reserved)], now)).lines

    expect(line).toMatchObject({ kind: 'unavailable', reason: 'reserved' })
  })
})
