import { eq, inArray } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { books } from '@/server/db/schema'
import {
  createBook,
  createOrder,
  resetDatabase,
} from '@/server/db/test-helpers'
import { getBookByShortId, listCatalog } from './catalog'
import { BooksUnavailableError, reserveBooks } from './reservations'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const longAgo = new Date('2026-01-01T00:00:00.000Z')

beforeEach(resetDatabase)

async function load(id: string) {
  const [row] = await db.select().from(books).where(eq(books.id, id))
  return row
}

// What a checkout does: reserve inside a transaction, as the caller owns it.
async function reserveInTransaction(bookIds: string[], orderId: string) {
  return db.transaction((tx) => reserveBooks(tx, { bookIds, orderId, now }))
}

async function failureOf(run: Promise<unknown>) {
  try {
    await run
  } catch (error) {
    return error
  }
  return undefined
}

describe('reserveBooks', () => {
  it('reserves an available book for 48 hours and records the order', async () => {
    const order = await createOrder()
    const book = await createBook({ updatedAt: longAgo })

    const result = await reserveInTransaction([book.id], order.id)

    expect(result.reservedUntil).toEqual(at(48 * HOUR))
    const row = await load(book.id)
    expect(row.status).toBe('reserved')
    expect(row.reservedUntil).toEqual(at(48 * HOUR))
    expect(row.reservedByOrderId).toBe(order.id)
    expect(row.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime())
  })

  it('reserves every book of a cart', async () => {
    const order = await createOrder()
    const cart = [await createBook(), await createBook(), await createBook()]

    await reserveInTransaction(
      cart.map((b) => b.id),
      order.id,
    )

    for (const { id } of cart) {
      const row = await load(id)
      expect(row.status).toBe('reserved')
      expect(row.reservedByOrderId).toBe(order.id)
    }
  })

  it('is all or nothing: one sold book leaves the others untouched and is named', async () => {
    const order = await createOrder()
    const free1 = await createBook()
    const free2 = await createBook()
    const sold = await createBook({ status: 'sold', soldAt: at(-HOUR) })

    const error = await failureOf(
      reserveInTransaction([free1.id, sold.id, free2.id], order.id),
    )

    expect(error).toBeInstanceOf(BooksUnavailableError)
    expect((error as BooksUnavailableError).books).toEqual([
      { id: sold.id, reason: 'sold' },
    ])
    for (const { id } of [free1, free2]) {
      const row = await load(id)
      expect(row.status).toBe('available')
      expect(row.reservedByOrderId).toBeNull()
    }
  })

  it('leaves everything untouched even when the caller catches the failure and carries on', async () => {
    const order = await createOrder()
    const free = await createBook()
    const hidden = await createBook({ status: 'hidden' })

    await db.transaction(async (tx) => {
      await failureOf(
        reserveBooks(tx, {
          bookIds: [free.id, hidden.id],
          orderId: order.id,
          now,
        }),
      )
    })

    expect((await load(free.id)).status).toBe('available')
  })

  it('names each unavailable book with its reason', async () => {
    const order = await createOrder()
    const reserved = await createBook({
      status: 'reserved',
      reservedUntil: at(HOUR),
    })
    const hidden = await createBook({ status: 'hidden' })
    const sold = await createBook({ status: 'sold', soldAt: at(-HOUR) })
    const missing = '5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50'

    const error = await failureOf(
      reserveInTransaction(
        [reserved.id, hidden.id, sold.id, missing],
        order.id,
      ),
    )

    const named = (error as BooksUnavailableError).books
    expect(named).toHaveLength(4)
    expect(named).toEqual(
      expect.arrayContaining([
        { id: reserved.id, reason: 'reserved' },
        { id: hidden.id, reason: 'hidden' },
        { id: sold.id, reason: 'sold' },
        { id: missing, reason: 'not_found' },
      ]),
    )
  })

  it('refuses a reservation that is still running, including at exactly the deadline', async () => {
    const order = await createOrder()
    const running = await createBook({
      status: 'reserved',
      reservedUntil: at(HOUR),
    })
    const atDeadline = await createBook({
      status: 'reserved',
      reservedUntil: now,
    })

    for (const book of [running, atDeadline]) {
      const error = await failureOf(reserveInTransaction([book.id], order.id))
      expect(error).toBeInstanceOf(BooksUnavailableError)
    }
  })

  it('takes a book whose reservation has expired and replaces the old order', async () => {
    const oldOrder = await createOrder()
    const newOrder = await createOrder()
    const book = await createBook({
      status: 'reserved',
      reservedUntil: at(-1),
      reservedByOrderId: oldOrder.id,
    })

    await reserveInTransaction([book.id], newOrder.id)

    const row = await load(book.id)
    expect(row.status).toBe('reserved')
    expect(row.reservedUntil).toEqual(at(48 * HOUR))
    expect(row.reservedByOrderId).toBe(newOrder.id)
  })

  it('treats a repeated id as one book, and rejects an empty or malformed list', async () => {
    const order = await createOrder()
    const book = await createBook()

    await reserveInTransaction([book.id, book.id], order.id)
    expect((await load(book.id)).status).toBe('reserved')

    await expect(reserveInTransaction([], order.id)).rejects.toThrow()
    await expect(
      reserveInTransaction(['not-a-uuid'], order.id),
    ).rejects.toThrow()
  })

  it('rolls back with the caller: a failure after reserving frees the book again', async () => {
    const order = await createOrder()
    const book = await createBook()

    const error = await failureOf(
      db.transaction(async (tx) => {
        await reserveBooks(tx, { bookIds: [book.id], orderId: order.id, now })
        throw new Error('the order insert failed')
      }),
    )

    expect((error as Error).message).toBe('the order insert failed')
    const row = await load(book.id)
    expect(row.status).toBe('available')
    expect(row.reservedByOrderId).toBeNull()
  })

  it('shows a reserved book as reserved in the catalog and on its page', async () => {
    const order = await createOrder()
    const book = await createBook()

    await reserveInTransaction([book.id], order.id)

    const items = await listCatalog(now)
    expect(items.find((item) => item.shortId === book.shortId)?.status).toBe(
      'reserved',
    )
    const detail = await getBookByShortId(book.shortId, now)
    expect(detail?.status).toBe('reserved')
  })
})

describe('reserveBooks under concurrency', () => {
  // The pool has 5 connections, so at most 4 transactions run together here.
  it('lets exactly one of two buyers have a book, every time', async () => {
    for (let round = 0; round < 25; round++) {
      await resetDatabase()
      const [orderA, orderB] = [await createOrder(), await createOrder()]
      const book = await createBook()

      const results = await Promise.allSettled([
        reserveInTransaction([book.id], orderA.id),
        reserveInTransaction([book.id], orderB.id),
      ])

      const winners = results.filter((r) => r.status === 'fulfilled')
      const losers = results.filter((r) => r.status === 'rejected')
      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)
      expect((losers[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        BooksUnavailableError,
      )
      const row = await load(book.id)
      expect([orderA.id, orderB.id]).toContain(row.reservedByOrderId)
    }
  })

  it('lets exactly one of four buyers have a book', async () => {
    for (let round = 0; round < 10; round++) {
      await resetDatabase()
      const orders = [
        await createOrder(),
        await createOrder(),
        await createOrder(),
        await createOrder(),
      ]
      const book = await createBook()

      const results = await Promise.allSettled(
        orders.map((o) => reserveInTransaction([book.id], o.id)),
      )

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const winner = results.findIndex((r) => r.status === 'fulfilled')
      expect((await load(book.id)).reservedByOrderId).toBe(orders[winner].id)
    }
  })

  it('lets exactly one of two overlapping carts win, without a deadlock and without a half-reserved loser', async () => {
    for (let round = 0; round < 25; round++) {
      await resetDatabase()
      const [orderA, orderB] = [await createOrder(), await createOrder()]
      const first = await createBook()
      const second = await createBook()
      const onlyForB = await createBook()

      // Opposite order on purpose: a naive row-by-row update would deadlock.
      const results = await Promise.allSettled([
        reserveInTransaction([first.id, second.id], orderA.id),
        reserveInTransaction([onlyForB.id, second.id, first.id], orderB.id),
      ])

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const winner = results[0].status === 'fulfilled' ? orderA : orderB
      const rows = await db
        .select()
        .from(books)
        .where(inArray(books.id, [first.id, second.id, onlyForB.id]))
      const byId = new Map(rows.map((r) => [r.id, r]))
      expect(byId.get(first.id)?.reservedByOrderId).toBe(winner.id)
      expect(byId.get(second.id)?.reservedByOrderId).toBe(winner.id)
      // The loser's extra book is free again unless the winner was B.
      expect(byId.get(onlyForB.id)?.status).toBe(
        winner.id === orderB.id ? 'reserved' : 'available',
      )
    }
  })
})
