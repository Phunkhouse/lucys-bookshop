import { randomBytes } from 'node:crypto'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { checkoutInputSchema, type CheckoutInput } from '@/lib/checkout-schema'
import { classifyCartLine } from './cart-rules'
import { db } from './db/client'
import { books, orderCounters, orderItems, orders, settings } from './db/schema'
import {
  normalizeShipping,
  orderNumber,
  orderTotalMinor,
  pragueYear,
  shippingCostMinor,
} from './order-rules'
import {
  BooksUnavailableError,
  RESERVATION_MS,
  reserveBooks,
  type UnavailableReason,
} from './reservations'

export type PlaceOrderInput = CheckoutInput

export type PlacedOrder = {
  orderId: string
  number: number
  publicToken: string
  totalMinor: number
  expiresAt: Date
  // True when this checkout key had already produced the order.
  replayed: boolean
}

export type PriceChange = {
  shortId: string
  seenPriceMinor: number
  priceMinor: number
}

// The buyer must look again: a book price or the shipping price moved after
// they saw it, or Zásilkovna has no price yet. Nothing was written.
export class PlaceOrderError extends Error {
  readonly code: 'price_changed' | 'shipping_changed' | 'shipping_unavailable'
  readonly priceChanges: PriceChange[]

  constructor(code: PlaceOrderError['code'], priceChanges: PriceChange[] = []) {
    super(`Checkout stopped: ${code}`)
    this.name = 'PlaceOrderError'
    this.code = code
    this.priceChanges = priceChanges
  }
}

type PlacedRow = Pick<
  typeof orders.$inferSelect,
  'id' | 'number' | 'publicToken' | 'totalMinor' | 'expiresAt'
>

const placed = (row: PlacedRow, replayed: boolean): PlacedOrder => ({
  orderId: row.id,
  number: row.number,
  publicToken: row.publicToken,
  totalMinor: row.totalMinor,
  expiresAt: row.expiresAt,
  replayed,
})

// Creates the order and reserves its books in one transaction (spec 6.4, 6.5):
// all of it, or none of it.
//
// - Prices and shipping are read here, under the book locks. Nothing the browser
//   sends is added to the total; its seen prices are only compared.
// - The same checkout key returns the order it already made. A per-key advisory
//   lock makes two simultaneous submits queue, so the second one finds the first
//   instead of failing on its own reservation.
// - Book rows are locked in id order before anything is written, like
//   reserveBooks does, so carts sharing books cannot deadlock.
// - The order number comes from an atomic upsert on the year's counter inside
//   this transaction: a rollback gives the number back.
//
// Throws BooksUnavailableError (names the books), PlaceOrderError (prices
// changed, shipping unavailable) or a ZodError for input the form should
// never have sent.
export async function placeOrder(
  rawInput: PlaceOrderInput,
  now: Date,
): Promise<PlacedOrder> {
  const input = checkoutInputSchema.parse(rawInput)

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.checkoutKey}))`,
    )
    const [existing] = await tx
      .select()
      .from(orders)
      .where(eq(orders.checkoutKey, input.checkoutKey))
    if (existing) return placed(existing, true)

    const [shopSettings] = await tx.select().from(settings)
    const shippingMinor = shippingCostMinor(input.shippingMethod, shopSettings)
    if (shippingMinor === null) {
      throw new PlaceOrderError('shipping_unavailable')
    }
    // Like a book price: what the buyer saw is only compared, the server's
    // value is the one charged.
    if (input.shippingMinorSeen !== shippingMinor) {
      throw new PlaceOrderError('shipping_changed')
    }

    const rows = await tx
      .select()
      .from(books)
      .where(
        inArray(
          books.shortId,
          input.cart.map((item) => item.shortId),
        ),
      )
      .orderBy(asc(books.id))
      .for('update')
    const byShortId = new Map(rows.map((row) => [row.shortId, row]))

    const unavailable: { id: string; reason: UnavailableReason }[] = []
    const priceChanges: PriceChange[] = []
    for (const item of input.cart) {
      const row = byShortId.get(item.shortId)
      const line = classifyCartLine(item, row, now, null)
      if (line.kind === 'gone') {
        unavailable.push({
          id: row?.id ?? item.shortId,
          reason: row ? 'hidden' : 'not_found',
        })
      } else if (line.kind === 'unavailable') {
        unavailable.push({ id: row!.id, reason: line.reason })
      } else if (line.kind === 'price_changed') {
        priceChanges.push({
          shortId: line.shortId,
          seenPriceMinor: line.seenPriceMinor,
          priceMinor: line.priceMinor,
        })
      }
    }
    if (unavailable.length > 0) throw new BooksUnavailableError(unavailable)
    if (priceChanges.length > 0) {
      throw new PlaceOrderError('price_changed', priceChanges)
    }

    const currencies = new Set(rows.map((row) => row.currency))
    if (currencies.size !== 1) throw new Error('An order cannot mix currencies')
    const [currency] = currencies

    const totalMinor = orderTotalMinor(
      rows.map((row) => row.priceMinor),
      shippingMinor,
    )

    const year = pragueYear(now)
    const [counter] = await tx
      .insert(orderCounters)
      .values({ year, last: 1 })
      .onConflictDoUpdate({
        target: orderCounters.year,
        set: { last: sql`${orderCounters.last} + 1` },
      })
      .returning({ last: orderCounters.last })

    const expiresAt = new Date(now.getTime() + RESERVATION_MS)
    const [order] = await tx
      .insert(orders)
      .values({
        number: orderNumber(year, counter.last),
        publicToken: randomBytes(32).toString('base64url'),
        paymentMethod: input.paymentMethod,
        email: input.email,
        name: input.name,
        phone: input.phone,
        shippingMethod: input.shippingMethod,
        shippingDetails: normalizeShipping(
          input.shippingMethod,
          input.shippingDetails,
        ),
        shippingCostMinor: shippingMinor,
        totalMinor,
        currency,
        locale: 'cs',
        expiresAt,
        checkoutKey: input.checkoutKey,
        termsAcceptedAt: now,
      })
      .returning()

    await tx.insert(orderItems).values(
      rows.map((row) => ({
        orderId: order.id,
        bookId: row.id,
        titleSnapshot: row.title,
        priceMinorSnapshot: row.priceMinor,
      })),
    )

    const { reservedUntil } = await reserveBooks(tx, {
      bookIds: rows.map((row) => row.id),
      orderId: order.id,
      now,
    })
    if (reservedUntil.getTime() !== expiresAt.getTime()) {
      throw new Error('Order expiry and reservation end disagree')
    }

    return placed(order, false)
  })
}
