import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { db } from '@/server/db/client'
import { books, orderItems, orders } from '@/server/db/schema'
import {
  createBook,
  createOrder,
  resetDatabase,
} from '@/server/db/test-helpers'
import { markPaid } from './order-status'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const NO_ID = '00000000-0000-4000-8000-000000000000'

beforeEach(resetDatabase)

async function seed(overrides: Partial<typeof orders.$inferInsert> = {}) {
  const order = await createOrder({ expiresAt: at(20 * HOUR), ...overrides })
  const book = await createBook({
    status: 'reserved',
    reservedUntil: order.expiresAt,
    reservedByOrderId: order.id,
  })
  await db.insert(orderItems).values({
    orderId: order.id,
    bookId: book.id,
    titleSnapshot: book.title,
    priceMinorSnapshot: book.priceMinor,
  })
  return { order, book }
}

describe('markPaid (the seller confirms a payment)', () => {
  it('marks the order paid and sells its books', async () => {
    const actor = await testActor()
    const { order, book } = await seed()

    expect(await markPaid(actor, order.id, now)).toEqual({ outcome: 'paid' })

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id))
    expect(row.status).toBe('paid')
    expect(row.paidAt).toEqual(now)
    const [sold] = await db.select().from(books).where(eq(books.id, book.id))
    expect(sold.status).toBe('sold')
  })

  it('is safe to call twice: the second call reports unchanged', async () => {
    const actor = await testActor()
    const { order } = await seed()
    await markPaid(actor, order.id, now)

    expect(await markPaid(actor, order.id, at(HOUR))).toEqual({
      outcome: 'unchanged',
    })
  })

  it.each(['cancelled', 'refunded'] as const)(
    'refuses a %s order',
    async (status) => {
      const actor = await testActor()
      const { order } = await seed({
        status,
        paidAt: status === 'refunded' ? at(-HOUR) : null,
      })

      expect(await markPaid(actor, order.id, now)).toEqual({
        outcome: 'refused',
        reason: 'not_payable',
      })
    },
  )

  it('reports the books that went to someone else, and changes nothing', async () => {
    const actor = await testActor()
    const { order, book } = await seed({ expiresAt: at(-5 * HOUR) })
    const other = await createOrder()
    await db
      .update(books)
      .set({
        status: 'reserved',
        reservedUntil: at(40 * HOUR),
        reservedByOrderId: other.id,
      })
      .where(eq(books.id, book.id))

    const result = await markPaid(actor, order.id, now)

    expect(result).toEqual({
      outcome: 'conflict',
      books: [{ id: book.id, title: book.title, reason: 'reserved' }],
    })
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id))
    expect(row.status).toBe('pending_payment')
  })

  it('reports an unknown or malformed id as not found', async () => {
    const actor = await testActor()
    for (const id of [NO_ID, 'not-a-uuid']) {
      expect(await markPaid(actor, id, now)).toEqual({
        outcome: 'refused',
        reason: 'not_found',
      })
    }
  })
})
