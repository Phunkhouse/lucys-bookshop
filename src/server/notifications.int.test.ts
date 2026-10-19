import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { orderItems, orders } from '@/server/db/schema'
import {
  createBook,
  createOrder,
  resetDatabase,
} from '@/server/db/test-helpers'
import { notifySellerOfNewOrder, notifyUnnotifiedOrders } from './notifications'
import { FakeNotifier } from './test-notifier'

const now = new Date('2026-10-18T12:00:00.000Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const context = { adminBaseUrl: 'https://shop.example', now }
const NO_ID = '00000000-0000-4000-8000-000000000000'

beforeEach(resetDatabase)

async function seed(
  overrides: Partial<typeof orders.$inferInsert> = {},
  bookCount = 1,
) {
  const order = await createOrder({ createdAt: at(-HOUR), ...overrides })
  for (let i = 0; i < bookCount; i++) {
    const book = await createBook()
    await db.insert(orderItems).values({
      orderId: order.id,
      bookId: book.id,
      titleSnapshot: `Kniha ${order.number}-${i}`,
      priceMinorSnapshot: book.priceMinor,
    })
  }
  return order
}

async function notifiedAt(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id))
  return row.sellerNotifiedAt
}

describe('notifySellerOfNewOrder', () => {
  it('sends the order once and records when', async () => {
    const notifier = new FakeNotifier()
    const order = await seed(
      {
        name: 'Jana Nováková',
        totalMinor: 23900,
        paymentMethod: 'cash_on_pickup',
      },
      2,
    )

    const result = await notifySellerOfNewOrder(notifier, order.id, context)

    expect(result).toBe('sent')
    expect(notifier.orders).toHaveLength(1)
    expect(notifier.orders[0]).toMatchObject({
      number: order.number,
      name: 'Jana Nováková',
      totalMinor: 23900,
      currency: 'CZK',
      paymentMethod: 'cash_on_pickup',
      shippingMethod: 'pickup',
      expiresAt: order.expiresAt,
      adminUrl: `https://shop.example/admin/orders/${order.number}`,
    })
    expect(notifier.orders[0].items.map((i) => i.title).sort()).toEqual([
      `Kniha ${order.number}-0`,
      `Kniha ${order.number}-1`,
    ])
    expect(await notifiedAt(order.id)).toEqual(now)
  })

  it('sends nothing the second time', async () => {
    const notifier = new FakeNotifier()
    const order = await seed()
    await notifySellerOfNewOrder(notifier, order.id, context)

    const again = await notifySellerOfNewOrder(notifier, order.id, {
      ...context,
      now: at(HOUR),
    })

    expect(again).toBe('already_notified')
    expect(notifier.orders).toHaveLength(1)
    expect(await notifiedAt(order.id)).toEqual(now)
  })

  // The checkout must never fail because the provider is down.
  it('reports a failure instead of throwing, and leaves the order unnotified', async () => {
    const notifier = new FakeNotifier()
    notifier.failAll = true
    const order = await seed()

    const result = await notifySellerOfNewOrder(notifier, order.id, context)

    expect(result).toBe('failed')
    expect(await notifiedAt(order.id)).toBeNull()

    notifier.failAll = false
    expect(await notifySellerOfNewOrder(notifier, order.id, context)).toBe(
      'sent',
    )
    expect(await notifiedAt(order.id)).toEqual(now)
  })

  it('reports an unknown or malformed id as not found', async () => {
    const notifier = new FakeNotifier()

    for (const id of [NO_ID, 'not-a-uuid']) {
      expect(await notifySellerOfNewOrder(notifier, id, context)).toBe(
        'not_found',
      )
    }
    expect(notifier.orders).toHaveLength(0)
  })

  it('never hands the notifier the buyer contact details or the note', async () => {
    const notifier = new FakeNotifier()
    const order = await seed({
      email: 'tajny.kupujici@example.test',
      phone: '+420 999 888 777',
      note: 'soukromá poznámka',
      shippingMethod: 'zasilkovna',
      shippingDetails: 'Výdejní místo Tajná 1',
    })

    await notifySellerOfNewOrder(notifier, order.id, context)

    const sent = JSON.stringify(notifier.orders[0])
    for (const secret of [
      'tajny.kupujici@example.test',
      '999 888 777',
      'soukromá poznámka',
      'Tajná 1',
      order.publicToken,
    ]) {
      expect(sent).not.toContain(secret)
    }
  })
})

describe('notifyUnnotifiedOrders', () => {
  it('sends the orders that were never notified, oldest first, and marks them', async () => {
    const notifier = new FakeNotifier()
    const newer = await seed({ createdAt: at(-2 * HOUR) })
    const older = await seed({ createdAt: at(-5 * HOUR) })
    const done = await seed({ sellerNotifiedAt: at(-3 * HOUR) })

    const result = await notifyUnnotifiedOrders(notifier, context)

    expect(result).toEqual({ sent: 2, failed: 0 })
    expect(notifier.orders.map((o) => o.number)).toEqual([
      older.number,
      newer.number,
    ])
    expect(await notifiedAt(older.id)).toEqual(now)
    expect(await notifiedAt(newer.id)).toEqual(now)
    // The one that was done keeps its old time.
    expect(await notifiedAt(done.id)).toEqual(at(-3 * HOUR))
  })

  // Checkout sends its own right after the order is placed. The retry only
  // takes what that missed, so the two do not collide.
  it('leaves the newest orders alone for 10 minutes', async () => {
    const notifier = new FakeNotifier()
    const exactly = await seed({ createdAt: at(-10 * MINUTE) })
    const tooNew = await seed({ createdAt: at(-10 * MINUTE + 1) })

    await notifyUnnotifiedOrders(notifier, context)

    expect(notifier.orders.map((o) => o.number)).toEqual([exactly.number])
    expect(await notifiedAt(tooNew.id)).toBeNull()
  })

  it('also sends an order that is already paid, but skips cancelled and refunded ones', async () => {
    const notifier = new FakeNotifier()
    const paid = await seed({ status: 'paid', paidAt: at(-HOUR) })
    const cancelled = await seed({ status: 'cancelled' })
    const refunded = await seed({ status: 'refunded', paidAt: at(-HOUR) })

    await notifyUnnotifiedOrders(notifier, context)

    expect(notifier.orders.map((o) => o.number)).toEqual([paid.number])
    expect(await notifiedAt(cancelled.id)).toBeNull()
    expect(await notifiedAt(refunded.id)).toBeNull()
  })

  it('sends at most 20 per run and leaves the rest for the next', async () => {
    const notifier = new FakeNotifier()
    for (let i = 0; i < 25; i++) await seed({ createdAt: at(-(30 - i) * HOUR) })

    const first = await notifyUnnotifiedOrders(notifier, context)
    const second = await notifyUnnotifiedOrders(notifier, context)

    expect(first).toEqual({ sent: 20, failed: 0 })
    expect(second).toEqual({ sent: 5, failed: 0 })
    expect(new Set(notifier.orders.map((o) => o.number)).size).toBe(25)
  })

  it('carries on after one order fails, and tries the failed one again next time', async () => {
    const notifier = new FakeNotifier()
    const a = await seed({ createdAt: at(-3 * HOUR) })
    const b = await seed({ createdAt: at(-2 * HOUR) })
    const c = await seed({ createdAt: at(-1 * HOUR) })
    notifier.failFor.add(b.number)

    const first = await notifyUnnotifiedOrders(notifier, context)

    expect(first).toEqual({ sent: 2, failed: 1 })
    expect(notifier.orders.map((o) => o.number)).toEqual([a.number, c.number])
    expect(await notifiedAt(b.id)).toBeNull()

    notifier.failFor.clear()
    const second = await notifyUnnotifiedOrders(notifier, {
      ...context,
      now: at(HOUR),
    })
    expect(second).toEqual({ sent: 1, failed: 0 })
    expect(notifier.orders.map((o) => o.number)).toEqual([
      a.number,
      c.number,
      b.number,
    ])
  })

  it('does nothing when there is nothing to send', async () => {
    const notifier = new FakeNotifier()

    expect(await notifyUnnotifiedOrders(notifier, context)).toEqual({
      sent: 0,
      failed: 0,
    })
  })
})
