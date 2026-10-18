import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { orderItems, orders } from '@/server/db/schema'
import {
  createBook,
  createOrder,
  resetDatabase,
} from '@/server/db/test-helpers'
import { getOrderView } from './order-view'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const token = (n: number) => `${'A'.repeat(42)}${n}`

beforeEach(resetDatabase)

async function orderWithItems(
  overrides: Partial<typeof orders.$inferInsert> = {},
  items: { title: string; price: number }[] = [
    { title: 'Babička', price: 18900 },
  ],
) {
  const order = await createOrder({
    publicToken: token(1),
    expiresAt: new Date(now.getTime() + HOUR),
    ...overrides,
  })
  for (const item of items) {
    const book = await createBook({ title: item.title, priceMinor: item.price })
    await db.insert(orderItems).values({
      orderId: order.id,
      bookId: book.id,
      titleSnapshot: item.title,
      priceMinorSnapshot: item.price,
    })
  }
  return order
}

describe('getOrderView', () => {
  it('finds an order by its token and shows what was bought at the price then', async () => {
    const order = await orderWithItems(
      { number: 20260007, shippingCostMinor: 8900, totalMinor: 27800 },
      [
        { title: 'Babička', price: 18900 },
        { title: 'Máj', price: 0 },
      ],
    )

    const view = await getOrderView(token(1), now)

    expect(view).toMatchObject({
      number: 20260007,
      stage: 'awaiting_payment',
      paymentMethod: 'bank_transfer',
      shippingMethod: 'pickup',
      shippingCostMinor: 8900,
      totalMinor: 27800,
      currency: 'CZK',
      expiresAt: order.expiresAt,
    })
    expect(view?.items.map((i) => [i.title, i.priceMinor]).sort()).toEqual([
      ['Babička', 18900],
      ['Máj', 0],
    ])
  })

  it("shows the snapshot, not today's title or price", async () => {
    await orderWithItems()
    await db.update(orderItems).set({ titleSnapshot: 'Old title' })
    const view = await getOrderView(token(1), now)
    expect(view?.items[0].title).toBe('Old title')
  })

  it('says nothing about the buyer except what they typed for delivery', async () => {
    await orderWithItems({
      email: 'secret@example.com',
      name: 'Secret Name',
      phone: '+420111222333',
      note: 'seller note',
      shippingMethod: 'zasilkovna',
      shippingDetails: 'Z-Box Praha 1',
      trackingNumber: 'Z123',
    })
    const view = await getOrderView(token(1), now)
    const text = JSON.stringify(view)
    for (const secret of [
      'secret@example.com',
      'Secret Name',
      '+420111222333',
      'seller note',
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(view).toMatchObject({
      shippingDetails: 'Z-Box Praha 1',
      trackingNumber: 'Z123',
    })
  })

  it.each([
    ['pending_payment', 'awaiting_payment'],
    ['paid', 'paid'],
    ['shipped', 'shipped'],
    ['completed', 'completed'],
    ['cancelled', 'cancelled'],
    ['refunded', 'refunded'],
  ] as const)('shows %s as %s', async (status, stage) => {
    await orderWithItems({ status, paidAt: now })
    expect((await getOrderView(token(1), now))?.stage).toBe(stage)
  })

  it('shows a pending order as expired once the deadline has passed, not before', async () => {
    await orderWithItems({ expiresAt: now })
    expect((await getOrderView(token(1), now))?.stage).toBe('awaiting_payment')
    expect(
      (await getOrderView(token(1), new Date(now.getTime() + 1)))?.stage,
    ).toBe('expired')
    // A read never changes the order.
    const [row] = await db
      .select()
      .from(orders)
      .where(eq(orders.publicToken, token(1)))
    expect(row.status).toBe('pending_payment')
  })

  it('does not call a paid order expired', async () => {
    await orderWithItems({
      status: 'paid',
      paidAt: now,
      expiresAt: new Date(now.getTime() - HOUR),
    })
    expect((await getOrderView(token(1), now))?.stage).toBe('paid')
  })

  it.each([
    ['an unknown token', token(2)],
    ['the token in other letter case', token(1).toLowerCase()],
    ['a token that is too short', 'abc'],
    ['an empty token', ''],
    ['characters that are not in a token', `${'A'.repeat(42)}%`],
    ['a very long token', 'A'.repeat(5000)],
  ])('finds nothing for %s', async (_label, wrong) => {
    await orderWithItems()
    expect(await getOrderView(wrong, now)).toBeNull()
  })
})
