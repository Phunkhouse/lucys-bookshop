import { eq, inArray } from 'drizzle-orm'
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
import {
  cancelOrder,
  extendReservation,
  markCompleted,
  markShipped,
  refundOrder,
  setOrderNote,
} from './order-status'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const NO_ID = '00000000-0000-4000-8000-000000000000'

beforeEach(resetDatabase)

type OrderRow = typeof orders.$inferSelect
type Seed = {
  books?: number
  status?: OrderRow['status']
  paymentMethod?: OrderRow['paymentMethod']
  shippingMethod?: OrderRow['shippingMethod']
  expiresAt?: Date
}

// An order in a state checkout and "mark paid" would have left it in: its
// books reserved by it until the deadline, or sold by it once paid.
async function seed({
  books: count = 1,
  status = 'pending_payment',
  paymentMethod = 'bank_transfer',
  shippingMethod = 'pickup',
  expiresAt = at(24 * HOUR),
}: Seed = {}) {
  const isPaid = status !== 'pending_payment' && status !== 'cancelled'
  const order = await createOrder({
    status,
    paymentMethod,
    shippingMethod,
    expiresAt,
    paidAt: isPaid ? at(-HOUR) : null,
  })
  const bookRows = []
  for (let i = 0; i < count; i++) {
    const book = await createBook(
      isPaid
        ? {
            status: 'sold',
            soldAt: at(-HOUR),
            reservedByOrderId: order.id,
          }
        : {
            status: 'reserved',
            reservedUntil: expiresAt,
            reservedByOrderId: order.id,
          },
    )
    await db.insert(orderItems).values({
      orderId: order.id,
      bookId: book.id,
      titleSnapshot: book.title,
      priceMinorSnapshot: book.priceMinor,
    })
    bookRows.push(book)
  }
  return { order, books: bookRows }
}

async function loadOrder(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id))
  return row
}
async function loadBook(id: string) {
  const [row] = await db.select().from(books).where(eq(books.id, id))
  return row
}
async function loadBooks(ids: string[]) {
  return db.select().from(books).where(inArray(books.id, ids))
}

function expectFree(book: typeof books.$inferSelect) {
  expect(book.status).toBe('available')
  expect(book.reservedUntil).toBeNull()
  expect(book.reservedByOrderId).toBeNull()
  expect(book.soldAt).toBeNull()
}

describe('cancelOrder', () => {
  it('cancels a pending order and frees its books', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed({ books: 2 })

    const result = await cancelOrder(actor, order.id)

    expect(result).toEqual({ outcome: 'cancelled' })
    expect((await loadOrder(order.id)).status).toBe('cancelled')
    for (const book of held) expectFree(await loadBook(book.id))
  })

  it('is safe to call twice: the second call writes nothing', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed()
    await cancelOrder(actor, order.id)
    const orderBefore = await loadOrder(order.id)
    const bookBefore = await loadBook(held[0].id)

    const again = await cancelOrder(actor, order.id)

    expect(again).toEqual({ outcome: 'unchanged' })
    expect(await loadOrder(order.id)).toEqual(orderBefore)
    expect(await loadBook(held[0].id)).toEqual(bookBefore)
  })

  it('cancels an expired unpaid order but leaves a book that someone else reserved since', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed({
      books: 2,
      expiresAt: at(-2 * HOUR),
    })
    const newer = await createOrder()
    await db
      .update(books)
      .set({
        status: 'reserved',
        reservedUntil: at(40 * HOUR),
        reservedByOrderId: newer.id,
      })
      .where(eq(books.id, held[0].id))

    const result = await cancelOrder(actor, order.id)

    expect(result).toEqual({ outcome: 'cancelled' })
    const taken = await loadBook(held[0].id)
    expect(taken.status).toBe('reserved')
    expect(taken.reservedByOrderId).toBe(newer.id)
    expect(taken.reservedUntil).toEqual(at(40 * HOUR))
    expectFree(await loadBook(held[1].id))
  })

  it.each(['paid', 'shipped', 'completed', 'refunded'] as const)(
    'refuses a %s order and writes nothing',
    async (status) => {
      const actor = await testActor()
      const { order, books: held } = await seed({
        status,
        shippingMethod: status === 'shipped' ? 'zasilkovna' : 'pickup',
      })
      const bookBefore = await loadBook(held[0].id)

      const result = await cancelOrder(actor, order.id)

      expect(result).toEqual({ outcome: 'refused', reason: 'not_cancellable' })
      expect((await loadOrder(order.id)).status).toBe(status)
      expect(await loadBook(held[0].id)).toEqual(bookBefore)
    },
  )

  it("does not touch another order's books", async () => {
    const actor = await testActor()
    const mine = await seed()
    const other = await seed()
    const otherBefore = await loadBook(other.books[0].id)

    await cancelOrder(actor, mine.order.id)

    expect(await loadBook(other.books[0].id)).toEqual(otherBefore)
    expect((await loadOrder(other.order.id)).status).toBe('pending_payment')
  })

  it('reports an unknown or malformed id as not found', async () => {
    const actor = await testActor()
    for (const id of [NO_ID, 'not-a-uuid']) {
      expect(await cancelOrder(actor, id)).toEqual({
        outcome: 'refused',
        reason: 'not_found',
      })
    }
  })

  it('leaves a consistent order when cancel and mark paid run together', async () => {
    const actor = await testActor()
    for (let round = 0; round < 5; round++) {
      const { order, books: held } = await seed({ books: 2 })

      await Promise.all([
        cancelOrder(actor, order.id),
        manualPaymentConfirmer.confirm(order.id, now),
      ])

      const finalOrder = await loadOrder(order.id)
      const finalBooks = await loadBooks(held.map((b) => b.id))
      if (finalOrder.status === 'cancelled') {
        for (const book of finalBooks) expectFree(book)
      } else {
        expect(finalOrder.status).toBe('paid')
        for (const book of finalBooks) {
          expect(book.status).toBe('sold')
          expect(book.reservedByOrderId).toBe(order.id)
        }
      }
    }
  })
})

describe('refundOrder', () => {
  it('refunds a paid order, keeps paidAt and puts the books back on sale', async () => {
    const actor = await testActor()
    const { order, books: sold } = await seed({ status: 'paid', books: 2 })
    const paidAt = (await loadOrder(order.id)).paidAt

    const result = await refundOrder(actor, order.id)

    expect(result).toEqual({ outcome: 'refunded' })
    const row = await loadOrder(order.id)
    expect(row.status).toBe('refunded')
    expect(row.paidAt).toEqual(paidAt)
    for (const book of sold) expectFree(await loadBook(book.id))
  })

  it.each(['shipped', 'completed'] as const)(
    'refunds a %s order the same way',
    async (status) => {
      const actor = await testActor()
      const { order, books: sold } = await seed({
        status,
        shippingMethod: 'zasilkovna',
      })

      expect(await refundOrder(actor, order.id)).toEqual({
        outcome: 'refunded',
      })
      expect((await loadOrder(order.id)).status).toBe('refunded')
      expectFree(await loadBook(sold[0].id))
    },
  )

  it('is safe to call twice: the second call writes nothing', async () => {
    const actor = await testActor()
    const { order, books: sold } = await seed({ status: 'paid' })
    await refundOrder(actor, order.id)
    const orderBefore = await loadOrder(order.id)
    const bookBefore = await loadBook(sold[0].id)

    expect(await refundOrder(actor, order.id)).toEqual({
      outcome: 'unchanged',
    })
    expect(await loadOrder(order.id)).toEqual(orderBefore)
    expect(await loadBook(sold[0].id)).toEqual(bookBefore)
  })

  it.each(['pending_payment', 'cancelled'] as const)(
    'refuses a %s order',
    async (status) => {
      const actor = await testActor()
      const { order } = await seed({ status })

      expect(await refundOrder(actor, order.id)).toEqual({
        outcome: 'refused',
        reason: 'not_refundable',
      })
      expect((await loadOrder(order.id)).status).toBe(status)
    },
  )

  it('leaves a book alone that belongs to another order by now', async () => {
    const actor = await testActor()
    const { order, books: sold } = await seed({ status: 'paid', books: 2 })
    const newer = await createOrder()
    // Not reachable through the app while the order is paid, but the refund
    // must only ever free books this order still holds.
    await db
      .update(books)
      .set({ reservedByOrderId: newer.id })
      .where(eq(books.id, sold[0].id))

    await refundOrder(actor, order.id)

    expect((await loadBook(sold[0].id)).status).toBe('sold')
    expectFree(await loadBook(sold[1].id))
  })

  it('leaves a consistent order when refund and ship run together', async () => {
    const actor = await testActor()
    for (let round = 0; round < 5; round++) {
      const { order, books: sold } = await seed({
        status: 'paid',
        shippingMethod: 'zasilkovna',
      })

      await Promise.all([
        refundOrder(actor, order.id),
        markShipped(actor, order.id, 'Z123456789'),
      ])

      const finalOrder = await loadOrder(order.id)
      const [book] = await loadBooks(sold.map((b) => b.id))
      if (finalOrder.status === 'refunded') {
        expectFree(book)
      } else {
        expect(finalOrder.status).toBe('shipped')
        expect(book.status).toBe('sold')
      }
    }
  })
})

describe('extendReservation', () => {
  it('moves the order deadline and every book deadline together', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed({
      books: 2,
      paymentMethod: 'cash_on_pickup',
      expiresAt: at(5 * HOUR),
    })

    const result = await extendReservation(actor, order.id, now)

    const expected = at(5 * HOUR + 48 * HOUR)
    expect(result).toEqual({ outcome: 'extended', expiresAt: expected })
    expect((await loadOrder(order.id)).expiresAt).toEqual(expected)
    for (const book of await loadBooks(held.map((b) => b.id))) {
      expect(book.status).toBe('reserved')
      expect(book.reservedUntil).toEqual(expected)
      expect(book.reservedByOrderId).toBe(order.id)
    }
  })

  it('never shortens a deadline that is already further away', async () => {
    const actor = await testActor()
    const { order } = await seed({
      paymentMethod: 'cash_on_pickup',
      expiresAt: at(10 * 24 * HOUR),
    })

    await extendReservation(actor, order.id, now)

    expect((await loadOrder(order.id)).expiresAt).toEqual(
      at(10 * 24 * HOUR + 48 * HOUR),
    )
  })

  it('refuses a bank transfer order', async () => {
    const actor = await testActor()
    const { order } = await seed({ paymentMethod: 'bank_transfer' })
    const before = await loadOrder(order.id)

    expect(await extendReservation(actor, order.id, now)).toEqual({
      outcome: 'refused',
      reason: 'not_extendable',
    })
    expect(await loadOrder(order.id)).toEqual(before)
  })

  it.each(['paid', 'cancelled', 'refunded'] as const)(
    'refuses a %s order',
    async (status) => {
      const actor = await testActor()
      const { order } = await seed({ status, paymentMethod: 'cash_on_pickup' })

      expect(await extendReservation(actor, order.id, now)).toEqual({
        outcome: 'refused',
        reason: 'not_extendable',
      })
    },
  )

  it('re-reserves the books of an expired order that nobody else took', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed({
      paymentMethod: 'cash_on_pickup',
      expiresAt: at(-3 * HOUR),
    })

    const result = await extendReservation(actor, order.id, now)

    const expected = at(48 * HOUR)
    expect(result).toEqual({ outcome: 'extended', expiresAt: expected })
    const book = await loadBook(held[0].id)
    expect(book.status).toBe('reserved')
    expect(book.reservedUntil).toEqual(expected)
    expect(book.reservedByOrderId).toBe(order.id)
  })

  it('reports a conflict and writes nothing when someone else took a book', async () => {
    const actor = await testActor()
    const { order, books: held } = await seed({
      books: 2,
      paymentMethod: 'cash_on_pickup',
      expiresAt: at(-3 * HOUR),
    })
    const newer = await createOrder()
    await db
      .update(books)
      .set({
        status: 'reserved',
        reservedUntil: at(40 * HOUR),
        reservedByOrderId: newer.id,
      })
      .where(eq(books.id, held[1].id))
    const orderBefore = await loadOrder(order.id)
    const booksBefore = await loadBooks(held.map((b) => b.id))

    const result = await extendReservation(actor, order.id, now)

    expect(result).toEqual({
      outcome: 'conflict',
      books: [{ id: held[1].id, title: held[1].title, reason: 'reserved' }],
    })
    expect(await loadOrder(order.id)).toEqual(orderBefore)
    expect(await loadBooks(held.map((b) => b.id))).toEqual(booksBefore)
  })
})

describe('markShipped', () => {
  it('ships a paid Zásilkovna order and saves the tracking number', async () => {
    const actor = await testActor()
    const { order } = await seed({
      status: 'paid',
      shippingMethod: 'zasilkovna',
    })

    const result = await markShipped(actor, order.id, '  Z123 456 789 ')

    expect(result).toEqual({ outcome: 'shipped' })
    const row = await loadOrder(order.id)
    expect(row.status).toBe('shipped')
    expect(row.trackingNumber).toBe('Z123 456 789')
  })

  it('refuses a Zásilkovna order without a usable tracking number', async () => {
    const actor = await testActor()
    const { order } = await seed({
      status: 'paid',
      shippingMethod: 'zasilkovna',
    })

    for (const bad of ['', '   ', 'x'.repeat(101), 'Z1\nZ2']) {
      expect(await markShipped(actor, order.id, bad)).toEqual({
        outcome: 'refused',
        reason: 'invalid_tracking',
      })
    }
    const row = await loadOrder(order.id)
    expect(row.status).toBe('paid')
    expect(row.trackingNumber).toBeNull()
  })

  it('refuses an unpaid order', async () => {
    const actor = await testActor()
    const { order } = await seed({ shippingMethod: 'zasilkovna' })

    expect(await markShipped(actor, order.id, 'Z123456789')).toEqual({
      outcome: 'refused',
      reason: 'not_shippable',
    })
    expect((await loadOrder(order.id)).status).toBe('pending_payment')
  })

  it('refuses a personal pickup order: nothing is shipped', async () => {
    const actor = await testActor()
    const { order } = await seed({ status: 'paid', shippingMethod: 'pickup' })

    expect(await markShipped(actor, order.id, 'Z123456789')).toEqual({
      outcome: 'refused',
      reason: 'not_shippable',
    })
    const row = await loadOrder(order.id)
    expect(row.status).toBe('paid')
    expect(row.trackingNumber).toBeNull()
  })

  it('is safe to call twice: the first tracking number stays', async () => {
    const actor = await testActor()
    const { order } = await seed({
      status: 'paid',
      shippingMethod: 'zasilkovna',
    })
    await markShipped(actor, order.id, 'Z111')

    expect(await markShipped(actor, order.id, 'Z222')).toEqual({
      outcome: 'unchanged',
    })
    expect((await loadOrder(order.id)).trackingNumber).toBe('Z111')
  })

  it('reports an unknown id as not found', async () => {
    const actor = await testActor()
    expect(await markShipped(actor, NO_ID, 'Z123')).toEqual({
      outcome: 'refused',
      reason: 'not_found',
    })
  })
})

describe('markCompleted', () => {
  it('completes a shipped Zásilkovna order', async () => {
    const actor = await testActor()
    const { order } = await seed({
      status: 'shipped',
      shippingMethod: 'zasilkovna',
    })

    expect(await markCompleted(actor, order.id)).toEqual({
      outcome: 'completed',
    })
    expect((await loadOrder(order.id)).status).toBe('completed')
  })

  it('completes a paid pickup order straight away', async () => {
    const actor = await testActor()
    const { order } = await seed({ status: 'paid', shippingMethod: 'pickup' })

    expect(await markCompleted(actor, order.id)).toEqual({
      outcome: 'completed',
    })
    expect((await loadOrder(order.id)).status).toBe('completed')
  })

  it('refuses a paid Zásilkovna order: it has to be shipped first', async () => {
    const actor = await testActor()
    const { order } = await seed({
      status: 'paid',
      shippingMethod: 'zasilkovna',
    })

    expect(await markCompleted(actor, order.id)).toEqual({
      outcome: 'refused',
      reason: 'not_completable',
    })
    expect((await loadOrder(order.id)).status).toBe('paid')
  })

  it.each(['pending_payment', 'cancelled', 'refunded'] as const)(
    'refuses a %s order',
    async (status) => {
      const actor = await testActor()
      const { order } = await seed({ status })

      expect(await markCompleted(actor, order.id)).toEqual({
        outcome: 'refused',
        reason: 'not_completable',
      })
      expect((await loadOrder(order.id)).status).toBe(status)
    },
  )

  it('is safe to call twice', async () => {
    const actor = await testActor()
    const { order } = await seed({ status: 'paid' })
    await markCompleted(actor, order.id)

    expect(await markCompleted(actor, order.id)).toEqual({
      outcome: 'unchanged',
    })
  })
})

describe('setOrderNote', () => {
  it.each([
    'pending_payment',
    'paid',
    'shipped',
    'completed',
    'cancelled',
    'refunded',
  ] as const)('saves a trimmed note on a %s order', async (status) => {
    const actor = await testActor()
    const { order } = await seed({ status, shippingMethod: 'zasilkovna' })

    expect(await setOrderNote(actor, order.id, '  zaplatila méně ')).toEqual({
      outcome: 'saved',
    })
    expect((await loadOrder(order.id)).note).toBe('zaplatila méně')
  })

  it('clears the note when given an empty one', async () => {
    const actor = await testActor()
    const { order } = await seed()
    await setOrderNote(actor, order.id, 'něco')

    await setOrderNote(actor, order.id, '  ')

    expect((await loadOrder(order.id)).note).toBeNull()
  })

  it('refuses a note that is too long and keeps the old one', async () => {
    const actor = await testActor()
    const { order } = await seed()
    await setOrderNote(actor, order.id, 'stará')

    expect(await setOrderNote(actor, order.id, 'x'.repeat(2001))).toEqual({
      outcome: 'refused',
      reason: 'invalid_note',
    })
    expect((await loadOrder(order.id)).note).toBe('stará')
  })

  it('reports an unknown id as not found', async () => {
    const actor = await testActor()
    expect(await setOrderNote(actor, NO_ID, 'x')).toEqual({
      outcome: 'refused',
      reason: 'not_found',
    })
  })
})
