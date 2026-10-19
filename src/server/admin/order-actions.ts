import type { ShippingMethod } from '@/server/order-rules'
import type { OrderStage } from '@/server/order-stage'
import {
  canExtend,
  canTransition,
  type OrderStatus,
  type PaymentMethod,
} from '@/server/order-transitions'

// Which buttons the order page offers (spec 6.9). Taken from the same rules the
// services enforce, so the page never offers what they would refuse. The note
// is always possible and not listed.
export type OrderActionSet = {
  markPaid: boolean
  cancel: boolean
  extend: boolean
  ship: boolean
  // A typo in the number can be fixed after delivery too.
  fixTracking: boolean
  complete: boolean
  refund: boolean
}

// An expired order is still unpaid in the database: the seller can record a
// late payment or cancel it (spec 6.4).
function statusOf(stage: OrderStage): OrderStatus {
  return stage === 'awaiting_payment' || stage === 'expired'
    ? 'pending_payment'
    : stage
}

export function availableActions(
  stage: OrderStage,
  paymentMethod: PaymentMethod,
  shippingMethod: ShippingMethod,
): OrderActionSet {
  const status = statusOf(stage)
  return {
    markPaid: canTransition(status, 'paid', shippingMethod),
    cancel: canTransition(status, 'cancelled', shippingMethod),
    extend: canExtend({ status, paymentMethod }),
    ship: canTransition(status, 'shipped', shippingMethod),
    fixTracking:
      shippingMethod === 'zasilkovna' &&
      (status === 'shipped' || status === 'completed'),
    complete: canTransition(status, 'completed', shippingMethod),
    refund: canTransition(status, 'refunded', shippingMethod),
  }
}
