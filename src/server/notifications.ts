import { and, asc, eq, isNull, lte, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db/client'
import { orderItems, orders } from './db/schema'
import type { NotifiableOrder } from './notification-messages'
import type { SellerNotifier } from './notifier'

export type NotifyContext = {
  // The public address of the app, without a trailing slash.
  adminBaseUrl: string
  now: Date
}

export type NotifyResult = 'sent' | 'already_notified' | 'failed' | 'not_found'

// Checkout sends its own right after the order. The retry only takes what that
// missed, so the two do not collide, and each run is capped so a long outage
// does not become one huge burst.
export const RETRY_MIN_AGE_MS = 10 * 60 * 1000
export const RETRY_BATCH_SIZE = 20

const orderId = z.uuid()

// Tells the seller about one new order, at least once (spec 6.8): the mark is
// written after the send, so a crash in between can mean a second mail but
// never a lost one. A failure is reported, not thrown, because the buyer's
// checkout must never fail on the seller's mail. The order stays unmarked and
// notifyUnnotifiedOrders finds it again.
export async function notifySellerOfNewOrder(
  notifier: SellerNotifier,
  id: string,
  { adminBaseUrl, now }: NotifyContext,
): Promise<NotifyResult> {
  if (!orderId.safeParse(id).success) return 'not_found'

  const [order] = await db.select().from(orders).where(eq(orders.id, id))
  if (!order) return 'not_found'
  if (order.sellerNotifiedAt) return 'already_notified'

  const items = await db
    .select({
      title: orderItems.titleSnapshot,
      priceMinor: orderItems.priceMinorSnapshot,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.titleSnapshot), asc(orderItems.id))

  // Only what the message needs: no e-mail, phone, pickup point or note.
  const notifiable: NotifiableOrder = {
    number: order.number,
    name: order.name,
    items,
    totalMinor: order.totalMinor,
    currency: order.currency,
    paymentMethod: order.paymentMethod,
    shippingMethod: order.shippingMethod,
    expiresAt: order.expiresAt,
    adminUrl: `${adminBaseUrl}/admin/orders/${order.number}`,
  }

  try {
    await notifier.notifyNewOrder(notifiable)
  } catch (error) {
    console.error(
      `Seller notification for order ${order.number} failed:`,
      error instanceof Error ? error.message : 'unknown error',
    )
    return 'failed'
  }

  await db
    .update(orders)
    .set({ sellerNotifiedAt: now })
    .where(and(eq(orders.id, order.id), isNull(orders.sellerNotifiedAt)))
  return 'sent'
}

// The retry: orders that were never announced, oldest first. Cancelled and
// refunded ones are no news. One failure does not stop the others.
export async function notifyUnnotifiedOrders(
  notifier: SellerNotifier,
  context: NotifyContext,
): Promise<{ sent: number; failed: number }> {
  const due = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        isNull(orders.sellerNotifiedAt),
        lte(
          orders.createdAt,
          new Date(context.now.getTime() - RETRY_MIN_AGE_MS),
        ),
        notInArray(orders.status, ['cancelled', 'refunded']),
      ),
    )
    .orderBy(asc(orders.createdAt), asc(orders.number))
    .limit(RETRY_BATCH_SIZE)

  let sent = 0
  let failed = 0
  for (const { id } of due) {
    const result = await notifySellerOfNewOrder(notifier, id, context)
    if (result === 'sent') sent++
    else if (result === 'failed') failed++
  }
  return { sent, failed }
}
