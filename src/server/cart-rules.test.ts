import { describe, expect, it } from 'vitest'
import {
  classifyCartLine,
  subtotalMinor,
  type CartBook,
  type CartLine,
} from './cart-rules'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

function book(change: Partial<CartBook> = {}): CartBook {
  return {
    shortId: 'abc12345',
    title: 'Test book',
    author: 'Test Author',
    priceMinor: 15000,
    currency: 'CZK',
    status: 'available',
    reservedUntil: null,
    soldAt: null,
    ...change,
  }
}

const seen = { shortId: 'abc12345', priceMinorSeen: 15000 }

describe('classifyCartLine', () => {
  it('accepts an available book at the price the buyer saw', () => {
    expect(classifyCartLine(seen, book(), now, null)).toMatchObject({
      kind: 'ok',
      shortId: 'abc12345',
      title: 'Test book',
      priceMinor: 15000,
    })
  })

  it.each([
    ['went up', 18000],
    ['went down', 12000],
  ])('flags a price that %s, with the new and the seen price', (_n, price) => {
    expect(
      classifyCartLine(seen, book({ priceMinor: price }), now, null),
    ).toMatchObject({
      kind: 'price_changed',
      priceMinor: price,
      seenPriceMinor: 15000,
    })
  })

  it('accepts a book whose reservation has expired (lazy expiry)', () => {
    const expired = book({ status: 'reserved', reservedUntil: at(-HOUR) })
    expect(classifyCartLine(seen, expired, now, null).kind).toBe('ok')
  })

  it('reports a reserved book, still reserved at exactly the deadline', () => {
    for (const reservedUntil of [at(HOUR), now]) {
      const reserved = book({ status: 'reserved', reservedUntil })
      expect(classifyCartLine(seen, reserved, now, null)).toMatchObject({
        kind: 'unavailable',
        reason: 'reserved',
        title: 'Test book',
      })
    }
  })

  it('reports a sold book and keeps its title', () => {
    const sold = book({ status: 'sold', soldAt: at(-HOUR) })
    expect(classifyCartLine(seen, sold, now, null)).toMatchObject({
      kind: 'unavailable',
      reason: 'sold',
      title: 'Test book',
    })
  })

  it('treats a hidden or missing book as gone, without leaking the title', () => {
    const hidden = classifyCartLine(seen, book({ status: 'hidden' }), now, null)
    const missing = classifyCartLine(seen, undefined, now, null)
    expect(hidden).toEqual({ kind: 'gone', shortId: 'abc12345' })
    expect(missing).toEqual({ kind: 'gone', shortId: 'abc12345' })
  })

  it('decides by the stored price only: a seen price of any size is just a comparison', () => {
    const line = classifyCartLine(
      { shortId: 'abc12345', priceMinorSeen: 1 },
      book({ priceMinor: 15000 }),
      now,
      null,
    )
    expect(line).toMatchObject({ kind: 'price_changed', priceMinor: 15000 })
  })
})

describe('subtotalMinor', () => {
  const listed = {
    shortId: 'x',
    title: 't',
    author: 'a',
    currency: 'CZK',
    cover: null,
  }
  const ok = (priceMinor: number): CartLine => ({
    ...listed,
    kind: 'ok',
    priceMinor,
  })

  it('adds up server prices of buyable lines, changed prices included', () => {
    const lines: CartLine[] = [
      ok(10000),
      {
        ...listed,
        kind: 'price_changed',
        priceMinor: 5050,
        seenPriceMinor: 4000,
      },
    ]
    expect(subtotalMinor(lines)).toBe(15050)
  })

  it('leaves out reserved, sold and gone lines', () => {
    const lines: CartLine[] = [
      ok(10000),
      { ...listed, kind: 'unavailable', reason: 'sold' },
      { ...listed, kind: 'unavailable', reason: 'reserved' },
      { kind: 'gone', shortId: 'y' },
    ]
    expect(subtotalMinor(lines)).toBe(10000)
  })

  it('is zero for an empty cart', () => {
    expect(subtotalMinor([])).toBe(0)
  })
})
