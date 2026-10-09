import { beforeEach, describe, expect, it } from 'vitest'
import { isAvailableSql, isListedSql, isReservedSql } from './availability-sql'
import { displayStatus, isBuyable, isListedInCatalog } from './availability'
import { db } from './db/client'
import { books } from './db/schema'
import { createBook, resetDatabase } from './db/test-helpers'

const now = new Date('2026-10-08T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

// Only combinations the database accepts: a reserved book always has a deadline
// and a sold book always has a date (check constraints).
const cases: [string, Partial<typeof books.$inferInsert>][] = [
  ['available', { status: 'available' }],
  [
    'reserved, deadline in 1 hour',
    { status: 'reserved', reservedUntil: at(HOUR) },
  ],
  [
    'reserved, deadline 1 hour ago',
    { status: 'reserved', reservedUntil: at(-HOUR) },
  ],
  [
    'reserved, deadline exactly now',
    { status: 'reserved', reservedUntil: at(0) },
  ],
  [
    'reserved, deadline 1 ms ago',
    { status: 'reserved', reservedUntil: at(-1) },
  ],
  ['reserved, deadline in 1 ms', { status: 'reserved', reservedUntil: at(1) }],
  ['sold 1 day ago', { status: 'sold', soldAt: at(-DAY) }],
  ['sold 100 days ago', { status: 'sold', soldAt: at(-100 * DAY) }],
  [
    'sold 13 days 23 hours ago',
    { status: 'sold', soldAt: at(-(14 * DAY - HOUR)) },
  ],
  [
    'sold 14 days minus 1 ms ago',
    { status: 'sold', soldAt: at(-(14 * DAY - 1)) },
  ],
  ['sold exactly 14 days ago', { status: 'sold', soldAt: at(-14 * DAY) }],
  [
    'sold 14 days plus 1 ms ago',
    { status: 'sold', soldAt: at(-(14 * DAY + 1)) },
  ],
  ['sold in the future', { status: 'sold', soldAt: at(HOUR) }],
  ['hidden', { status: 'hidden' }],
  [
    'hidden with an expired reservation date',
    { status: 'hidden', reservedUntil: at(-HOUR) },
  ],
  ['hidden with a recent sold date', { status: 'hidden', soldAt: at(-DAY) }],
]

beforeEach(resetDatabase)

describe('SQL availability rules match the TypeScript rules', () => {
  it('agrees with isListedInCatalog, isBuyable and displayStatus for every case', async () => {
    for (const [, fields] of cases) await createBook(fields)
    const all = await db.select().from(books)
    expect(all).toHaveLength(cases.length)

    const listedInSql = new Set(
      (
        await db.select({ id: books.id }).from(books).where(isListedSql(now))
      ).map((r) => r.id),
    )
    const availableInSql = new Set(
      (
        await db.select({ id: books.id }).from(books).where(isAvailableSql(now))
      ).map((r) => r.id),
    )

    const reservedInSql = new Set(
      (
        await db.select({ id: books.id }).from(books).where(isReservedSql(now))
      ).map((r) => r.id),
    )

    for (const book of all) {
      expect(
        reservedInSql.has(book.id),
        `reserved: ${book.status} ${book.title}`,
      ).toBe(displayStatus(book, now) === 'reserved')
      expect(
        listedInSql.has(book.id),
        `listed: ${book.status} ${book.title}`,
      ).toBe(isListedInCatalog(book, now))
      expect(
        availableInSql.has(book.id),
        `available: ${book.status} ${book.title}`,
      ).toBe(isBuyable(book, now))
    }
  })

  it.each(cases.map(([name], i) => [name, i] as const))(
    'matches for %s',
    async (_name, index) => {
      const book = await createBook(cases[index][1])
      const [listed] = await db
        .select({ id: books.id })
        .from(books)
        .where(isListedSql(now))
      expect(listed?.id === book.id).toBe(isListedInCatalog(book, now))
    },
  )
})
