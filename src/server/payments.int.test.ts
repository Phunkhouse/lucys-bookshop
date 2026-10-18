import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { books, orders } from '@/server/db/schema'
import { createBook, resetDatabase } from '@/server/db/test-helpers'
import { placeOrder, type PlaceOrderInput } from './orders'
import {
  manualPaymentConfirmer,
  type PaymentConfirmer,
  type ConfirmResult,
} from './payments'
import { BooksUnavailableError } from './reservations'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

// Code that depends on the interface only, as the admin will.
const confirmer: PaymentConfirmer = manualPaymentConfirmer

beforeEach(resetDatabase)

type BookRow = typeof books.$inferSelect

let keyCounter = 0
async function order(
  bookRows: BookRow[],
  overrides: Partial<PlaceOrderInput> = {},
  when = now,
) {
  return placeOrder(
    {
      cart: bookRows.map((b) => ({
        shortId: b.shortId,
        priceMinorSeen: b.priceMinor,
      })),
      name: 'Jana Nováková',
      email: 'jana@example.com',
      phone: '+420 601 234 567',
      shippingMethod: 'pickup',
      paymentMethod: 'bank_transfer',
      acceptTerms: true,
      acceptPrivacy: true,
      shippingMinorSeen: 0,
      checkoutKey: `00000000-0000-4000-8000-${String(++keyCounter).padStart(12, '0')}`,
      ...overrides,
    },
    when,
  )
}

async function loadBook(id: string) {
  const [row] = await db.select().from(books).where(eq(books.id, id))
  return row
}
async function loadOrder(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id))
  return row
}

function paid(result: ConfirmResult) {
  expect(result.status).toBe('paid')
}

describe('manualPaymentConfirmer.confirm', () => {
  it('marks a pending order paid and sells its books', async () => {
    const a = await createBook()
    const b = await createBook()
    const placed = await order([a, b])
    const payDay = at(5 * HOUR)

    const result = await confirmer.confirm(placed.orderId, payDay)

    paid(result)
    const row = await loadOrder(placed.orderId)
    expect(row.status).toBe('paid')
    expect(row.paidAt).toEqual(payDay)
    for (const book of [a, b]) {
      const sold = await loadBook(book.id)
      expect(sold.status).toBe('sold')
      expect(sold.soldAt).toEqual(payDay)
      expect(sold.reservedUntil).toBeNull()
      expect(sold.reservedByOrderId).toBe(placed.orderId)
    }
  })

  it('treats a cash on pickup order the same way', async () => {
    const book = await createBook()
    const placed = await order([book], { paymentMethod: 'cash_on_pickup' })

    paid(await confirmer.confirm(placed.orderId, at(HOUR)))

    expect((await loadOrder(placed.orderId)).status).toBe('paid')
    expect((await loadBook(book.id)).status).toBe('sold')
  })

  it('is safe to call twice: the second call changes nothing', async () => {
    const book = await createBook()
    const placed = await order([book])
    await confirmer.confirm(placed.orderId, at(HOUR))
    const before = await loadOrder(placed.orderId)
    const bookBefore = await loadBook(book.id)

    const again = await confirmer.confirm(placed.orderId, at(9 * HOUR))

    expect(again.status).toBe('already_paid')
    expect(await loadOrder(placed.orderId)).toEqual(before)
    expect(await loadBook(book.id)).toEqual(bookBefore)
  })

  it('makes one transition when ten confirmations arrive together', async () => {
    const book = await createBook()
    const placed = await order([book])

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        confirmer.confirm(placed.orderId, at(HOUR)),
      ),
    )

    expect(results.filter((r) => r.status === 'paid')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'already_paid')).toHaveLength(9)
    expect((await loadBook(book.id)).status).toBe('sold')
  })

  it.each(['shipped', 'completed'] as const)(
    'treats a %s order as already paid',
    async (status) => {
      const book = await createBook()
      const placed = await order([book])
      await confirmer.confirm(placed.orderId, at(HOUR))
      await db
        .update(orders)
        .set({ status })
        .where(eq(orders.id, placed.orderId))
      const before = await loadOrder(placed.orderId)

      const result = await confirmer.confirm(placed.orderId, at(2 * HOUR))

      expect(result.status).toBe('already_paid')
      expect(await loadOrder(placed.orderId)).toEqual(before)
    },
  )

  it.each(['cancelled', 'refunded'] as const)(
    'refuses a %s order and changes nothing',
    async (status) => {
      const book = await createBook()
      const placed = await order([book])
      await db
        .update(orders)
        .set({ status })
        .where(eq(orders.id, placed.orderId))
      const bookBefore = await loadBook(book.id)

      const result = await confirmer.confirm(placed.orderId, at(HOUR))

      expect(result).toEqual({ status: 'not_payable', orderStatus: status })
      expect((await loadOrder(placed.orderId)).status).toBe(status)
      expect((await loadOrder(placed.orderId)).paidAt).toBeNull()
      expect(await loadBook(book.id)).toEqual(bookBefore)
    },
  )

  it('reports an unknown order', async () => {
    expect(
      await confirmer.confirm('00000000-0000-4000-8000-0000000000ff', now),
    ).toEqual({ status: 'not_found' })
    expect(await confirmer.confirm('not-a-uuid', now)).toEqual({
      status: 'not_found',
    })
  })

  describe('late payment (spec 6.4)', () => {
    it('sells the books of an expired order when nobody took them', async () => {
      const a = await createBook()
      const b = await createBook()
      const placed = await order([a, b])
      const late = at(72 * HOUR) // reservation ended at +48 h

      const result = await confirmer.confirm(placed.orderId, late)

      paid(result)
      expect((await loadOrder(placed.orderId)).status).toBe('paid')
      expect((await loadBook(a.id)).status).toBe('sold')
      expect((await loadBook(b.id)).soldAt).toEqual(late)
    })

    it('also sells a book that another expired reservation had overwritten', async () => {
      const book = await createBook()
      const first = await order([book])
      // A second buyer reserved it after the first expired, then also let it expire.
      const second = await order([book], {}, at(50 * HOUR))

      const result = await confirmer.confirm(first.orderId, at(200 * HOUR))

      paid(result)
      expect((await loadBook(book.id)).status).toBe('sold')
      expect((await loadBook(book.id)).reservedByOrderId).toBe(first.orderId)
      expect((await loadOrder(second.orderId)).status).toBe('pending_payment')
    })

    it('reports a conflict when another buyer holds a book, and changes nothing', async () => {
      const a = await createBook({ title: 'Free one' })
      const b = await createBook({ title: 'Taken one' })
      const placed = await order([a, b])
      // After the first reservation expired, someone else ordered book b.
      const other = await order([b], {}, at(50 * HOUR))

      const result = await confirmer.confirm(placed.orderId, at(60 * HOUR))

      expect(result).toEqual({
        status: 'conflict',
        books: [{ id: b.id, title: 'Taken one', reason: 'reserved' }],
      })
      expect((await loadOrder(placed.orderId)).status).toBe('pending_payment')
      expect((await loadOrder(placed.orderId)).paidAt).toBeNull()
      expect((await loadBook(a.id)).status).toBe('reserved')
      expect((await loadBook(a.id)).soldAt).toBeNull()
      expect((await loadBook(b.id)).reservedByOrderId).toBe(other.orderId)
    })

    it('reports a book that was sold to someone else', async () => {
      const book = await createBook({ title: 'Gone' })
      const first = await order([book])
      const second = await order([book], {}, at(50 * HOUR))
      paid(await confirmer.confirm(second.orderId, at(51 * HOUR)))

      const result = await confirmer.confirm(first.orderId, at(60 * HOUR))

      expect(result).toEqual({
        status: 'conflict',
        books: [{ id: book.id, title: 'Gone', reason: 'sold' }],
      })
      expect((await loadBook(book.id)).reservedByOrderId).toBe(second.orderId)
    })

    it('reports a book the seller hid in the meantime', async () => {
      const book = await createBook({ title: 'Hidden now' })
      const placed = await order([book])
      await db
        .update(books)
        .set({ status: 'hidden', reservedUntil: null })
        .where(eq(books.id, book.id))

      const result = await confirmer.confirm(placed.orderId, at(72 * HOUR))

      expect(result).toEqual({
        status: 'conflict',
        books: [{ id: book.id, title: 'Hidden now', reason: 'hidden' }],
      })
    })

    it('never lets a late payment and a new buyer both get the book (15 rounds)', async () => {
      for (let round = 0; round < 15; round++) {
        await resetDatabase()
        const book = await createBook()
        const first = await order([book])
        const late = at(72 * HOUR)

        const [confirmed, buyer] = await Promise.allSettled([
          confirmer.confirm(first.orderId, late),
          order([book], {}, late),
        ])

        const confirmWon =
          confirmed.status === 'fulfilled' && confirmed.value.status === 'paid'
        const buyerWon = buyer.status === 'fulfilled'
        expect(confirmWon).not.toBe(buyerWon) // exactly one

        if (confirmWon) {
          expect(buyer.status).toBe('rejected')
          expect((buyer as PromiseRejectedResult).reason).toBeInstanceOf(
            BooksUnavailableError,
          )
          expect((await loadBook(book.id)).reservedByOrderId).toBe(
            first.orderId,
          )
        } else {
          expect(confirmed.status).toBe('fulfilled')
          expect(
            (confirmed as PromiseFulfilledResult<ConfirmResult>).value,
          ).toMatchObject({
            status: 'conflict',
          })
          expect((await loadOrder(first.orderId)).status).toBe(
            'pending_payment',
          )
        }
      }
    })
  })
})
