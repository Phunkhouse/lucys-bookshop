import { beforeEach, describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { db } from '@/server/db/client'
import { orderItems, orders } from '@/server/db/schema'
import {
  createBook,
  createOrder,
  resetDatabase,
} from '@/server/db/test-helpers'
import { listAdminOrders } from './order-list'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)

async function seed(
  overrides: Partial<typeof orders.$inferInsert> = {},
  bookCount = 1,
) {
  const order = await createOrder({
    expiresAt: at(30 * HOUR),
    paidAt: ['paid', 'shipped', 'completed', 'refunded'].includes(
      overrides.status ?? '',
    )
      ? at(-HOUR)
      : null,
    ...overrides,
  })
  for (let i = 0; i < bookCount; i++) {
    const book = await createBook()
    await db.insert(orderItems).values({
      orderId: order.id,
      bookId: book.id,
      titleSnapshot: book.title,
      priceMinorSnapshot: book.priceMinor,
    })
  }
  return order
}

describe('listAdminOrders', () => {
  it('returns nothing and zero counts for an empty shop', async () => {
    const actor = await testActor()

    const list = await listAdminOrders(actor, { stage: 'all', now })

    expect(list.items).toEqual([])
    expect(Object.values(list.counts).every((n) => n === 0)).toBe(true)
  })

  it('lists newest first with what the seller needs at a glance', async () => {
    const actor = await testActor()
    const older = await seed(
      {
        name: 'Jana Nováková',
        createdAt: at(-48 * HOUR),
        totalMinor: 32800,
        paymentMethod: 'bank_transfer',
        shippingMethod: 'zasilkovna',
        shippingCostMinor: 8900,
      },
      2,
    )
    const newer = await seed({
      name: 'Petr Svoboda',
      createdAt: at(-HOUR),
      totalMinor: 18900,
      paymentMethod: 'cash_on_pickup',
      shippingMethod: 'pickup',
    })

    const { items } = await listAdminOrders(actor, { stage: 'all', now })

    expect(items.map((item) => item.id)).toEqual([newer.id, older.id])
    expect(items[0]).toMatchObject({
      number: newer.number,
      name: 'Petr Svoboda',
      stage: 'awaiting_payment',
      expiringSoon: false,
      paymentMethod: 'cash_on_pickup',
      shippingMethod: 'pickup',
      totalMinor: 18900,
      currency: 'CZK',
      bookCount: 1,
      createdAt: newer.createdAt,
    })
    expect(items[1]).toMatchObject({
      name: 'Jana Nováková',
      shippingMethod: 'zasilkovna',
      totalMinor: 32800,
      bookCount: 2,
    })
  })

  it('flags an unpaid order with 24 hours or less left, and only that', async () => {
    const actor = await testActor()
    const soon = await seed({ expiresAt: at(24 * HOUR) })
    const later = await seed({ expiresAt: at(24 * HOUR + 1) })
    const lapsed = await seed({ expiresAt: at(-1) })
    const paidSoon = await seed({ status: 'paid', expiresAt: at(HOUR) })

    const { items } = await listAdminOrders(actor, { stage: 'all', now })

    const flagged = (id: string) => items.find((i) => i.id === id)?.expiringSoon
    expect(flagged(soon.id)).toBe(true)
    expect(flagged(later.id)).toBe(false)
    expect(flagged(lapsed.id)).toBe(false)
    expect(flagged(paidSoon.id)).toBe(false)
  })

  it('shows an unpaid order past its deadline as expired and writes nothing', async () => {
    const actor = await testActor()
    const lapsed = await seed({ expiresAt: at(-HOUR) })

    const { items } = await listAdminOrders(actor, { stage: 'all', now })

    expect(items[0].stage).toBe('expired')
    const stored = await db.select().from(orders)
    expect(stored.find((o) => o.id === lapsed.id)?.status).toBe(
      'pending_payment',
    )
  })

  it('keeps awaiting payment and expired apart, also at the boundary', async () => {
    const actor = await testActor()
    const atDeadline = await seed({ expiresAt: now })
    const justPast = await seed({ expiresAt: at(-1) })

    const awaiting = await listAdminOrders(actor, {
      stage: 'awaiting_payment',
      now,
    })
    const expired = await listAdminOrders(actor, { stage: 'expired', now })

    expect(awaiting.items.map((i) => i.id)).toEqual([atDeadline.id])
    expect(expired.items.map((i) => i.id)).toEqual([justPast.id])
  })

  it.each(['paid', 'shipped', 'completed', 'cancelled', 'refunded'] as const)(
    'filters by %s',
    async (stage) => {
      const actor = await testActor()
      const wanted = await seed({ status: stage })
      for (const other of ['paid', 'shipped', 'cancelled'] as const) {
        if (other !== stage) await seed({ status: other })
      }
      await seed()

      const { items } = await listAdminOrders(actor, { stage, now })

      expect(items.map((i) => i.id)).toEqual([wanted.id])
      expect(items[0].stage).toBe(stage)
    },
  )

  it('counts every filter the same way the rows are filtered', async () => {
    const actor = await testActor()
    await seed()
    await seed({ expiresAt: at(2 * HOUR) })
    await seed({ expiresAt: at(-HOUR) })
    await seed({ status: 'paid' })
    await seed({ status: 'paid' })
    await seed({ status: 'shipped', shippingMethod: 'zasilkovna' })
    await seed({ status: 'completed' })
    await seed({ status: 'cancelled' })
    await seed({ status: 'refunded' })

    const { counts } = await listAdminOrders(actor, { stage: 'all', now })

    expect(counts).toEqual({
      all: 9,
      awaiting_payment: 2,
      expired: 1,
      paid: 2,
      shipped: 1,
      completed: 1,
      cancelled: 1,
      refunded: 1,
    })
    for (const [stage, count] of Object.entries(counts)) {
      const listed = await listAdminOrders(actor, {
        stage: stage as keyof typeof counts,
        now,
      })
      expect(listed.items).toHaveLength(count)
    }
  })
})
