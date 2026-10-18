// Where an order stands, as the seller and the buyer see it (spec 6.4, 6.7). Pure: no database, no Next.
import type { OrderStatus } from './order-transitions'

export type OrderStage =
  | 'awaiting_payment'
  | 'expired'
  | 'paid'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'refunded'

// Expiry is lazy (spec 6.4): an unpaid order past its deadline is shown as
// expired, and nothing is written. At exactly the deadline it still holds,
// like a book's reservation.
export function orderStage(
  status: OrderStatus,
  expiresAt: Date,
  now: Date,
): OrderStage {
  if (status !== 'pending_payment') return status
  return expiresAt.getTime() < now.getTime() ? 'expired' : 'awaiting_payment'
}

// The seller reminder goes out about 24 hours before the reservation ends
// (spec 6.4), and the admin list flags the same orders.
export const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000

export function isExpiringSoon(
  stage: OrderStage,
  expiresAt: Date,
  now: Date,
): boolean {
  return (
    stage === 'awaiting_payment' &&
    expiresAt.getTime() - now.getTime() <= EXPIRING_SOON_MS
  )
}
