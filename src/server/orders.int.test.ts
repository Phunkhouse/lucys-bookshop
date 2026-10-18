import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import {
  books,
  orderCounters,
  orderItems,
  orders,
  settings,
} from '@/server/db/schema'
import {
  createBook,
  createOrder,
  resetDatabase,
} from '@/server/db/test-helpers'
import { PlaceOrderError, placeOrder, type PlaceOrderInput } from './orders'
import { BooksUnavailableError, RESERVATION_MS } from './reservations'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

beforeEach(resetDatabase)

let keyCounter = 0
const newKey = () =>
  `00000000-0000-4000-8000-${String(++keyCounter).padStart(12, '0')}`

type BookRow = typeof books.$inferSelect

function checkout(
  bookRows: BookRow[],
  overrides: Partial<PlaceOrderInput> = {},
): PlaceOrderInput {
  return {
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
    checkoutKey: newKey(),
    shippingMinorSeen: 0,
    ...overrides,
  }
}

async function failureOf(run: Promise<unknown>) {
  try {
    await run
  } catch (error) {
    return error
  }
  return undefined
}

async function load(id: string) {
  const [row] = await db.select().from(books).where(eq(books.id, id))
  return row
}

describe('placeOrder', () => {
  it('creates the order, its snapshot items and the reservation', async () => {
    const a = await createBook({ title: 'Babička', priceMinor: 18900 })
    const b = await createBook({ title: 'Máj', priceMinor: 5000 })

    const result = await placeOrder(checkout([a, b]), now)

    const [order] = await db.select().from(orders)
    expect(order.id).toBe(result.orderId)
    expect(order.status).toBe('pending_payment')
    expect(order.paymentMethod).toBe('bank_transfer')
    expect(order.shippingMethod).toBe('pickup')
    expect(order.shippingCostMinor).toBe(0)
    expect(order.totalMinor).toBe(23900)
    expect(order.currency).toBe('CZK')
    expect(order.locale).toBe('cs')
    expect(order.email).toBe('jana@example.com')
    expect(order.expiresAt).toEqual(new Date(now.getTime() + RESERVATION_MS))
    expect(order.paidAt).toBeNull()

    const items = await db.select().from(orderItems)
    expect(
      items
        .map((i) => [i.titleSnapshot, i.priceMinorSnapshot])
        .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    ).toEqual([
      ['Babička', 18900],
      ['Máj', 5000],
    ])

    for (const book of [a, b]) {
      const row = await load(book.id)
      expect(row.status).toBe('reserved')
      expect(row.reservedByOrderId).toBe(order.id)
      expect(row.reservedUntil).toEqual(order.expiresAt)
    }
    expect(result.totalMinor).toBe(23900)
    expect(result.replayed).toBe(false)
  })

  describe('a retry with the same checkout key', () => {
    async function placedThenRetry(change: Partial<PlaceOrderInput>) {
      const a = await createBook()
      const b = await createBook()
      const extra = await createBook()
      const first = checkout([a, b])
      const original = await placeOrder(first, now)
      const retry = checkout([a, b, extra], {
        checkoutKey: first.checkoutKey,
        ...change,
      })
      return { a, b, extra, original, retry }
    }

    it('returns the order for an identical retry, even with other seen prices', async () => {
      const a = await createBook()
      const first = checkout([a])
      const original = await placeOrder(first, now)
      const retry = {
        ...first,
        cart: [{ shortId: a.shortId, priceMinorSeen: 1 }],
        name: '  Jana Nováková ',
      }
      const again = await placeOrder(retry, now)
      expect(again.orderId).toBe(original.orderId)
      expect(again.replayed).toBe(true)
    })

    it('refuses a retry that added a book, and tells which order exists', async () => {
      const { a, b, extra, original, retry } = await placedThenRetry({})

      const error = await failureOf(placeOrder(retry, now))

      expect(error).toBeInstanceOf(PlaceOrderError)
      const failed = error as PlaceOrderError
      expect(failed.code).toBe('already_placed')
      expect(failed.existing?.publicToken).toBe(original.publicToken)
      expect(failed.existing?.shortIds.sort()).toEqual(
        [a.shortId, b.shortId].sort(),
      )
      expect(await db.select().from(orders)).toHaveLength(1)
      expect((await load(extra.id)).status).toBe('available')
    })

    it.each([
      ['email', { email: 'jina@example.com' }],
      ['payment method', { paymentMethod: 'cash_on_pickup' as const }],
      ['name', { name: 'Jiná Osoba' }],
    ])('refuses a retry with the %s changed', async (_label, change) => {
      const a = await createBook()
      const first = checkout([a])
      await placeOrder(first, now)

      const error = await failureOf(placeOrder({ ...first, ...change }, now))

      expect((error as PlaceOrderError).code).toBe('already_placed')
      expect(await db.select().from(orders)).toHaveLength(1)
    })
  })

  it('stores the consent time, and the pickup point only for Zásilkovna', async () => {
    await db.insert(settings).values({ zasilkovnaPriceMinor: 8900 })
    const a = await createBook()
    const b = await createBook()

    await placeOrder(checkout([a]), now)
    await placeOrder(
      checkout([b], {
        shippingMethod: 'zasilkovna',
        shippingMinorSeen: 8900,
        shippingDetails: '  Z-Box Praha 1  ',
      }),
      now,
    )

    const rows = await db.select().from(orders).orderBy(orders.number)
    expect(rows[0].shippingDetails).toBeNull()
    expect(rows[1].shippingDetails).toBe('Z-Box Praha 1')
    expect(rows[1].shippingCostMinor).toBe(8900)
    expect(rows[1].totalMinor).toBe(b.priceMinor + 8900)
    for (const row of rows) expect(row.termsAcceptedAt).toEqual(now)
  })

  it('takes the shipping price from the settings, never from the browser', async () => {
    await db.insert(settings).values({ zasilkovnaPriceMinor: 8900 })
    const book = await createBook({ priceMinor: 10000 })
    const input = {
      ...checkout([book], {
        shippingMethod: 'zasilkovna',
        shippingMinorSeen: 8900,
        shippingDetails: 'Z-Box',
      }),
      shippingCostMinor: 0,
      totalMinor: 1,
    }
    await placeOrder(input as PlaceOrderInput, now)
    const [order] = await db.select().from(orders)
    expect(order.totalMinor).toBe(18900)
  })

  it('stops when the shipping price changed after the buyer saw it', async () => {
    await db.insert(settings).values({ zasilkovnaPriceMinor: 8900 })
    const book = await createBook()
    const input = checkout([book], {
      shippingMethod: 'zasilkovna',
      shippingDetails: 'Z-Box',
      shippingMinorSeen: 8900,
    })
    await db.update(settings).set({ zasilkovnaPriceMinor: 12900 })

    const error = await failureOf(placeOrder(input, now))

    expect(error).toBeInstanceOf(PlaceOrderError)
    expect((error as PlaceOrderError).code).toBe('shipping_changed')
    expect(await db.select().from(orders)).toHaveLength(0)
    expect((await load(book.id)).status).toBe('available')

    // With the new price in hand the order goes through at that price.
    await placeOrder({ ...input, shippingMinorSeen: 12900 }, now)
    const [order] = await db.select().from(orders)
    expect(order.shippingCostMinor).toBe(12900)
  })

  it('stops when the buyer saw a shipping price for pickup', async () => {
    const book = await createBook()
    const error = await failureOf(
      placeOrder(checkout([book], { shippingMinorSeen: 8900 }), now),
    )
    expect((error as PlaceOrderError).code).toBe('shipping_changed')
  })

  it('refuses Zásilkovna while the seller has set no price', async () => {
    const book = await createBook()
    const input = checkout([book], {
      shippingMethod: 'zasilkovna',
      shippingMinorSeen: 8900,
      shippingDetails: 'Z-Box',
    })

    const noRow = await failureOf(placeOrder(input, now))
    expect(noRow).toBeInstanceOf(PlaceOrderError)
    expect((noRow as PlaceOrderError).code).toBe('shipping_unavailable')

    await db.insert(settings).values({})
    const noPrice = await failureOf(placeOrder(input, now))
    expect((noPrice as PlaceOrderError).code).toBe('shipping_unavailable')

    expect(await db.select().from(orders)).toHaveLength(0)
    expect((await load(book.id)).status).toBe('available')
  })

  it('does not change an order when the settings change later', async () => {
    await db.insert(settings).values({ zasilkovnaPriceMinor: 8900 })
    const book = await createBook({ priceMinor: 10000 })
    await placeOrder(
      checkout([book], {
        shippingMethod: 'zasilkovna',
        shippingMinorSeen: 8900,
        shippingDetails: 'Z-Box',
      }),
      now,
    )

    await db.update(settings).set({ zasilkovnaPriceMinor: 12900 })
    await db.update(books).set({ priceMinor: 99900 })

    const [order] = await db.select().from(orders)
    expect(order.totalMinor).toBe(18900)
    const [item] = await db.select().from(orderItems)
    expect(item.priceMinorSnapshot).toBe(10000)
  })

  it('refuses cash with Zásilkovna even if the schema is bypassed', async () => {
    await db.insert(settings).values({ zasilkovnaPriceMinor: 8900 })
    const book = await createBook()
    const error = await failureOf(
      placeOrder(
        checkout([book], {
          shippingMethod: 'zasilkovna',
          shippingMinorSeen: 8900,
          shippingDetails: 'Z-Box',
          paymentMethod: 'cash_on_pickup',
        }),
        now,
      ),
    )
    expect(error).toBeDefined()
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('accepts cash on pickup with personal pickup', async () => {
    const book = await createBook()
    await placeOrder(checkout([book], { paymentMethod: 'cash_on_pickup' }), now)
    const [order] = await db.select().from(orders)
    expect(order.paymentMethod).toBe('cash_on_pickup')
  })

  describe('order number', () => {
    it('starts the year at 1 and counts up', async () => {
      const a = await createBook()
      const b = await createBook()
      const first = await placeOrder(checkout([a]), now)
      const second = await placeOrder(checkout([b]), now)
      expect(first.number).toBe(20260001)
      expect(second.number).toBe(20260002)
    })

    it('restarts the sequence in a new year, by the shop clock', async () => {
      const a = await createBook()
      const b = await createBook()
      const c = await createBook()
      await placeOrder(checkout([a]), now)
      // 23:30 UTC on 31 December is already 1 January in Prague.
      const lateOn31st = new Date('2026-12-31T23:30:00.000Z')
      const newYear = await placeOrder(checkout([b]), lateOn31st)
      const next = await placeOrder(checkout([c]), lateOn31st)
      expect(newYear.number).toBe(20270001)
      expect(next.number).toBe(20270002)
    })

    it('gives 20 simultaneous checkouts distinct numbers without gaps', async () => {
      const rows = await Promise.all(
        Array.from({ length: 20 }, () => createBook()),
      )
      const results = await Promise.all(
        rows.map((book) => placeOrder(checkout([book]), now)),
      )
      expect(results.map((r) => r.number).sort()).toEqual(
        Array.from({ length: 20 }, (_, i) => 20260001 + i),
      )
    })
  })

  describe('double selling', () => {
    it('gives a contested book to exactly one of two buyers (25 rounds)', async () => {
      for (let round = 0; round < 25; round++) {
        await resetDatabase()
        const book = await createBook()

        const outcomes = await Promise.allSettled([
          placeOrder(checkout([book]), now),
          placeOrder(checkout([book]), now),
        ])

        const won = outcomes.filter((o) => o.status === 'fulfilled')
        const lost = outcomes.filter((o) => o.status === 'rejected')
        expect(won).toHaveLength(1)
        expect(lost).toHaveLength(1)
        const reason = (lost[0] as PromiseRejectedResult).reason
        expect(reason).toBeInstanceOf(BooksUnavailableError)
        expect((reason as BooksUnavailableError).books[0].id).toBe(book.id)
        expect(await db.select().from(orders)).toHaveLength(1)
        expect(await db.select().from(orderItems)).toHaveLength(1)
      }
    })

    it('leaves nothing behind when the last book of a cart is gone', async () => {
      const a = await createBook()
      const b = await createBook()
      const taken = await createBook({
        status: 'reserved',
        reservedUntil: new Date(now.getTime() + HOUR),
      })

      const error = await failureOf(placeOrder(checkout([a, b, taken]), now))

      expect(error).toBeInstanceOf(BooksUnavailableError)
      expect((error as BooksUnavailableError).books).toEqual([
        { id: taken.id, reason: 'reserved' },
      ])
      expect(await db.select().from(orders)).toHaveLength(0)
      expect(await db.select().from(orderItems)).toHaveLength(0)
      expect(await db.select().from(orderCounters)).toHaveLength(0)
      expect((await load(a.id)).status).toBe('available')
      expect((await load(b.id)).status).toBe('available')
    })

    it('reports sold, hidden and unknown books without revealing more', async () => {
      const sold = await createBook({ status: 'sold', soldAt: now })
      const hidden = await createBook({ status: 'hidden' })
      const error = await failureOf(
        placeOrder(
          {
            ...checkout([sold, hidden]),
            cart: [
              ...checkout([sold, hidden]).cart,
              { shortId: 'nope123', priceMinorSeen: 100 },
            ],
          },
          now,
        ),
      )
      expect(error).toBeInstanceOf(BooksUnavailableError)
      const reasons = (error as BooksUnavailableError).books.map(
        (b) => b.reason,
      )
      expect(reasons.sort()).toEqual(['hidden', 'not_found', 'sold'])
      expect(await db.select().from(orders)).toHaveLength(0)
    })

    it('takes a book whose earlier reservation has expired', async () => {
      const oldOrder = await createOrder({ number: 20250001 })
      const book = await createBook({
        status: 'reserved',
        reservedUntil: new Date(now.getTime() - HOUR),
        reservedByOrderId: oldOrder.id,
      })

      const result = await placeOrder(checkout([book]), now)

      const row = await load(book.id)
      expect(row.status).toBe('reserved')
      expect(row.reservedByOrderId).toBe(result.orderId)
    })
  })

  describe('prices', () => {
    it('stops when a price changed after the buyer saw it', async () => {
      const a = await createBook({ priceMinor: 10000 })
      const b = await createBook({ priceMinor: 5000 })
      const input = checkout([a, b])
      await db
        .update(books)
        .set({ priceMinor: 12000 })
        .where(eq(books.id, a.id))

      const error = await failureOf(placeOrder(input, now))

      expect(error).toBeInstanceOf(PlaceOrderError)
      expect((error as PlaceOrderError).code).toBe('price_changed')
      expect((error as PlaceOrderError).priceChanges).toEqual([
        { shortId: a.shortId, seenPriceMinor: 10000, priceMinor: 12000 },
      ])
      expect(await db.select().from(orders)).toHaveLength(0)
      expect((await load(a.id)).status).toBe('available')
      expect((await load(b.id)).status).toBe('available')
    })

    it('treats the price from the browser as something to compare, not to charge', async () => {
      const book = await createBook({ priceMinor: 10000 })
      const error = await failureOf(
        placeOrder(
          {
            ...checkout([book]),
            cart: [{ shortId: book.shortId, priceMinorSeen: 1 }],
          },
          now,
        ),
      )
      expect((error as PlaceOrderError).code).toBe('price_changed')
      expect(await db.select().from(orders)).toHaveLength(0)
    })
  })

  describe('submitting twice', () => {
    it('returns the same order for the same checkout key', async () => {
      const book = await createBook()
      const input = checkout([book])

      const first = await placeOrder(input, now)
      const second = await placeOrder(input, new Date(now.getTime() + 5000))

      expect(second.orderId).toBe(first.orderId)
      expect(second.number).toBe(first.number)
      expect(second.publicToken).toBe(first.publicToken)
      expect(second.replayed).toBe(true)
      expect(await db.select().from(orders)).toHaveLength(1)
    })

    it('returns one order when the same key is sent at the same moment', async () => {
      for (let round = 0; round < 10; round++) {
        await resetDatabase()
        const book = await createBook()
        const input = checkout([book])

        const results = await Promise.all([
          placeOrder(input, now),
          placeOrder(input, now),
          placeOrder(input, now),
        ])

        expect(new Set(results.map((r) => r.orderId)).size).toBe(1)
        expect(results.filter((r) => !r.replayed)).toHaveLength(1)
        expect(await db.select().from(orders)).toHaveLength(1)
      }
    })
  })

  describe('token', () => {
    it('is long, url-safe and different for every order', async () => {
      const rows = await Promise.all([createBook(), createBook(), createBook()])
      const tokens: string[] = []
      for (const book of rows) {
        tokens.push((await placeOrder(checkout([book]), now)).publicToken)
      }
      for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43,}$/)
      expect(new Set(tokens).size).toBe(3)
    })
  })

  it('rejects input the schema would refuse', async () => {
    const book = await createBook()
    const error = await failureOf(
      placeOrder(
        checkout([book], { acceptTerms: false as unknown as true }),
        now,
      ),
    )
    expect(error).toBeDefined()
    expect(await db.select().from(orders)).toHaveLength(0)
  })
})
