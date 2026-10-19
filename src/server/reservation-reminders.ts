import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from './db/client'
import { orders } from './db/schema'
import type { ExpiringOrder } from './notification-messages'
import type { SellerNotifier } from './notifier'
import type { NotifyContext } from './notifications'
import { EXPIRING_SOON_MS } from './order-stage'

export const REMINDER_BATCH_SIZE = 20

type ClaimedRow = {
  id: string
  number: number
  name: string
  total_minor: number
  currency: string
  expires_at: Date | string
}

// The seller reminder (spec 6.4): unpaid orders whose reservation is still
// running and ends within 24 hours, once per order, in one mail. The window is
// the same as the "Brzy vyprší" flag in the admin list. At exactly the deadline
// the books are still held, so such an order still counts.
//
// At most once: the orders are claimed in one atomic update before anything is
// sent (SKIP LOCKED, so two runs at the same moment take different orders, never
// the same). If the send fails the claim is released, and the next run tries
// again. If the process dies between claim and send, that reminder is lost,
// which is the accepted price of never sending one twice.
export async function sendReservationReminders(
  notifier: SellerNotifier,
  { adminBaseUrl, now }: NotifyContext,
): Promise<{ sent: number; failed: number }> {
  const horizon = new Date(now.getTime() + EXPIRING_SOON_MS)

  // A materialized CTE, not "id IN (SELECT ... LIMIT ... FOR UPDATE SKIP LOCKED)":
  // the planner may run that subquery more than once, and a run then claims more
  // than the batch size.
  const result = await db.execute<ClaimedRow>(sql`
    WITH due AS MATERIALIZED (
      SELECT id FROM orders
      WHERE status = 'pending_payment'
        AND seller_reminded_at IS NULL
        AND expires_at >= ${now}
        AND expires_at <= ${horizon}
      ORDER BY expires_at, number
      LIMIT ${REMINDER_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE orders SET seller_reminded_at = ${now}
    FROM due
    WHERE orders.id = due.id AND orders.seller_reminded_at IS NULL
    RETURNING orders.id, orders.number, orders.name,
      orders.total_minor, orders.currency, orders.expires_at
  `)
  const claimed = result.rows.map((row) => ({
    id: row.id,
    number: row.number,
    name: row.name,
    totalMinor: row.total_minor,
    currency: row.currency,
    expiresAt: new Date(row.expires_at),
  }))
  if (claimed.length === 0) return { sent: 0, failed: 0 }

  // RETURNING has no order: soonest deadline first.
  const due: ExpiringOrder[] = claimed
    .sort(
      (a, b) =>
        a.expiresAt.getTime() - b.expiresAt.getTime() || a.number - b.number,
    )
    .map((order) => ({
      number: order.number,
      name: order.name,
      totalMinor: order.totalMinor,
      currency: order.currency,
      expiresAt: order.expiresAt,
      adminUrl: `${adminBaseUrl}/admin/orders/${order.number}`,
    }))

  try {
    await notifier.notifyReservationExpiring(due)
    return { sent: claimed.length, failed: 0 }
  } catch (error) {
    console.error(
      'Seller reminder failed:',
      error instanceof Error ? error.message : 'unknown error',
    )
    try {
      await db
        .update(orders)
        .set({ sellerRemindedAt: null })
        .where(
          and(
            inArray(
              orders.id,
              claimed.map((order) => order.id),
            ),
            eq(orders.sellerRemindedAt, now),
          ),
        )
    } catch (releaseError) {
      console.error(
        'Releasing the reminder claim failed:',
        releaseError instanceof Error ? releaseError.message : 'unknown error',
      )
    }
    return { sent: 0, failed: claimed.length }
  }
}
