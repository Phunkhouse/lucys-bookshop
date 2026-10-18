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
import { manualPaymentConfirmer } from '@/server/payments'
import { getAdminOrder } from './order-detail'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)

type OrderInsert = Partial<typeof orders.$inferInsert>

// An order as checkout leaves it: its books reserved by it until the deadline.
async function seed(overrides: OrderInsert = {}, bookCount = 1) {
  const order = await createOrder({ expiresAt: at(30 * HOUR), ...overrides })
  const held = []
  for (let i = 0; i < bookCount; i++) {
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
    held.push(book)
  }
  return { order, books: held }
}

describe('getAdminOrder', () => {
  it('returns everything the seller needs about the order', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed(
      {
        name: 'Jana Nováková',
        email: 'jana@example.com',
        phone: '+420 601 234 567',
        shippingMethod: 'zasilkovna',
        shippingDetails: 'Výdejní místo Praha 1',
        shippingCostMinor: 8900,
        totalMinor: 18900,
        paymentMethod: 'bank_transfer',
        note: 'zaplatila o 50 Kč méně',
        trackingNumber: 'Z123456789',
        expiresAt: at(10 * HOUR),
      },
      2,
    )

    const detail = await getAdminOrder(actor, order.number, now)

    expect(detail).toMatchObject({
      id: order.id,
      number: order.number,
      publicToken: order.publicToken,
      stage: 'awaiting_payment',
      expiringSoon: true,
      name: 'Jana Nováková',
      email: 'jana@example.com',
      phone: '+420 601 234 567',
      paymentMethod: 'bank_transfer',
      shippingMethod: 'zasilkovna',
      shippingDetails: 'Výdejní místo Praha 1',
      trackingNumber: 'Z123456789',
      shippingCostMinor: 8900,
      totalMinor: 18900,
      currency: 'CZK',
      note: 'zaplatila o 50 Kč méně',
      createdAt: order.createdAt,
      paidAt: null,
      expiresAt: at(10 * HOUR),
    })
    expect(detail?.items.map((item) => item.bookId).sort()).toEqual(
      held.map((b) => b.id).sort(),
    )
  })

  it('returns null for an unknown number', async () => {
    const actor = await testActor()
    await seed()

    expect(await getAdminOrder(actor, 29990001, now)).toBeNull()
  })

  it('shows the title and price the order was placed with, not the current ones', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed()
    await db
      .update(books)
      .set({ title: 'Nový název', priceMinor: 99900 })
      .where(eq(books.id, held[0].id))

    const detail = await getAdminOrder(actor, order.number, now)

    expect(detail?.items).toEqual([
      {
        bookId: held[0].id,
        title: held[0].title,
        priceMinor: held[0].priceMinor,
      },
    ])
  })

  it('shows an unpaid order past its deadline as expired', async () => {
    const actor = await testActor()
    const { order } = await seed({ expiresAt: at(-HOUR) })

    const detail = await getAdminOrder(actor, order.number, now)

    expect(detail?.stage).toBe('expired')
    expect(detail?.expiringSoon).toBe(false)
  })
})

describe('getAdminOrder: books in conflict', () => {
  async function takenByAnother(bookId: string, state: 'live' | 'lapsed') {
    const other = await createOrder()
    await db
      .update(books)
      .set({
        status: 'reserved',
        reservedUntil: at(state === 'live' ? 40 * HOUR : -HOUR),
        reservedByOrderId: other.id,
      })
      .where(eq(books.id, bookId))
  }

  it('lists a book another order holds now, with the reason', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed({ expiresAt: at(-5 * HOUR) }, 2)
    await takenByAnother(held[1].id, 'live')

    const detail = await getAdminOrder(actor, order.number, now)

    expect(detail?.conflicts).toEqual([
      { id: held[1].id, title: held[1].title, reason: 'reserved' },
    ])
  })

  it('has none while the order holds all its books, even past the deadline', async () => {
    const actor = await testActor()
    const { order } = await seed({ expiresAt: at(-5 * HOUR) }, 2)

    expect((await getAdminOrder(actor, order.number, now))?.conflicts).toEqual(
      [],
    )
  })

  it('has none for a book whose new reservation has lapsed too', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed({ expiresAt: at(-5 * HOUR) })
    await takenByAnother(held[0].id, 'lapsed')

    expect((await getAdminOrder(actor, order.number, now))?.conflicts).toEqual(
      [],
    )
  })

  it.each(['paid', 'cancelled'] as const)(
    'has none for a %s order: nothing is waiting for payment',
    async (status) => {
      const actor = await testActor()
      const { order, books: held } = await seed({
        status,
        paidAt: status === 'paid' ? at(-HOUR) : null,
        expiresAt: at(-5 * HOUR),
      })
      await takenByAnother(held[0].id, 'live')

      expect(
        (await getAdminOrder(actor, order.number, now))?.conflicts,
      ).toEqual([])
    },
  )

  // What the page warns about is exactly what "mark paid" would refuse.
  it.each([
    ['holds its books', false],
    ['lost a book to another order', true],
  ] as const)(
    'agrees with mark paid when the order %s',
    async (_label, lostOne) => {
      const actor = await testActor()
      const { order, books: held } = await seed({ expiresAt: at(-5 * HOUR) }, 2)
      if (lostOne) await takenByAnother(held[1].id, 'live')

      const detail = await getAdminOrder(actor, order.number, now)
      const result = await manualPaymentConfirmer.confirm(order.id, now)

      expect(result.status === 'conflict').toBe(detail!.conflicts.length > 0)
    },
  )
})
