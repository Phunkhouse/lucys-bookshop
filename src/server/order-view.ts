import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { orderItems, orders } from './db/schema'

// 32 random bytes as base64url, as placeOrder makes them.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/

export type OrderStage =
  | 'awaiting_payment'
  | 'expired'
  | 'paid'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'refunded'

// What the order page may show to whoever holds the link (spec 6.5, 6.7).
// Deliberately no e-mail, name, phone or seller note: the link is the only
// secret, so it should reveal as little as possible.
export type OrderView = {
  number: number
  stage: OrderStage
  paymentMethod: 'bank_transfer' | 'cash_on_pickup'
  shippingMethod: 'pickup' | 'zasilkovna'
  shippingDetails: string | null
  trackingNumber: string | null
  items: { title: string; priceMinor: number }[]
  shippingCostMinor: number
  totalMinor: number
  currency: string
  expiresAt: Date
}

// The order behind a link token, or null (unknown or malformed token: the page
// is a 404 either way). Expiry is lazy (spec 6.4): an unpaid order past its
// deadline is shown as expired, and nothing is written.
export async function getOrderView(
  token: string,
  now: Date,
): Promise<OrderView | null> {
  if (!TOKEN_FORMAT.test(token)) return null

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.publicToken, token))
  if (!order) return null

  const items = await db
    .select({
      title: orderItems.titleSnapshot,
      priceMinor: orderItems.priceMinorSnapshot,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))

  const stage: OrderStage =
    order.status === 'pending_payment'
      ? order.expiresAt.getTime() < now.getTime()
        ? 'expired'
        : 'awaiting_payment'
      : order.status

  return {
    number: order.number,
    stage,
    paymentMethod: order.paymentMethod,
    shippingMethod: order.shippingMethod,
    shippingDetails: order.shippingDetails,
    trackingNumber: order.trackingNumber,
    items,
    shippingCostMinor: order.shippingCostMinor,
    totalMinor: order.totalMinor,
    currency: order.currency,
    expiresAt: order.expiresAt,
  }
}
