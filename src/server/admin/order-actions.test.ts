import { describe, expect, it } from 'vitest'
import type { ShippingMethod } from '@/server/order-rules'
import type { OrderStage } from '@/server/order-stage'
import type { PaymentMethod } from '@/server/order-transitions'
import { availableActions, type OrderActionSet } from './order-actions'

const none: OrderActionSet = {
  markPaid: false,
  cancel: false,
  extend: false,
  ship: false,
  fixTracking: false,
  complete: false,
  refund: false,
}
const only = (...on: (keyof OrderActionSet)[]): OrderActionSet => ({
  ...none,
  ...Object.fromEntries(on.map((key) => [key, true])),
})

type Case = [OrderStage, PaymentMethod, ShippingMethod, OrderActionSet]

// Every stage, with both ways to pay and both ways to receive the books.
const CASES: Case[] = [
  // Unpaid: expired is as actionable as waiting, because a late payment can
  // still be recorded (spec 6.4). Only cash on pickup is extended.
  ['awaiting_payment', 'bank_transfer', 'pickup', only('markPaid', 'cancel')],
  [
    'awaiting_payment',
    'bank_transfer',
    'zasilkovna',
    only('markPaid', 'cancel'),
  ],
  [
    'awaiting_payment',
    'cash_on_pickup',
    'pickup',
    only('markPaid', 'cancel', 'extend'),
  ],
  ['expired', 'bank_transfer', 'pickup', only('markPaid', 'cancel')],
  ['expired', 'cash_on_pickup', 'pickup', only('markPaid', 'cancel', 'extend')],
  // Paid: a pickup is handed over, a Zásilkovna parcel is shipped first.
  ['paid', 'bank_transfer', 'pickup', only('complete', 'refund')],
  ['paid', 'cash_on_pickup', 'pickup', only('complete', 'refund')],
  ['paid', 'bank_transfer', 'zasilkovna', only('ship', 'refund')],
  // Shipped exists only for Zásilkovna.
  [
    'shipped',
    'bank_transfer',
    'zasilkovna',
    only('fixTracking', 'complete', 'refund'),
  ],
  // A tracking typo can be fixed after delivery too.
  ['completed', 'bank_transfer', 'zasilkovna', only('fixTracking', 'refund')],
  ['completed', 'bank_transfer', 'pickup', only('refund')],
  ['completed', 'cash_on_pickup', 'pickup', only('refund')],
  // Final states: nothing but the note.
  ['cancelled', 'bank_transfer', 'pickup', none],
  ['cancelled', 'cash_on_pickup', 'zasilkovna', none],
  ['refunded', 'bank_transfer', 'zasilkovna', none],
  ['refunded', 'cash_on_pickup', 'pickup', none],
]

describe('availableActions', () => {
  it.each(CASES)('%s, %s, %s', (stage, payment, shipping, expected) => {
    expect(availableActions(stage, payment, shipping)).toEqual(expected)
  })

  it('covers every stage with both shipping methods', () => {
    const stages: OrderStage[] = [
      'awaiting_payment',
      'expired',
      'paid',
      'shipped',
      'completed',
      'cancelled',
      'refunded',
    ]
    for (const stage of stages) {
      for (const shipping of ['pickup', 'zasilkovna'] as const) {
        // Shipped and Zásilkovna-only buttons are checked above; here we only
        // make sure no combination throws or returns a partial set.
        const set = availableActions(stage, 'bank_transfer', shipping)
        expect(Object.keys(set).sort()).toEqual(Object.keys(none).sort())
      }
    }
  })

  it('never offers shipping for a pickup order', () => {
    for (const stage of ['paid', 'shipped', 'completed'] as const) {
      const set = availableActions(stage, 'bank_transfer', 'pickup')
      expect(set.ship).toBe(false)
      expect(set.fixTracking).toBe(false)
    }
  })

  it('never offers an action the services would refuse', async () => {
    // The buttons and the rules come from the same table, so they cannot drift.
    const { canExtend, canTransition } =
      await import('@/server/order-transitions')
    const statusOf = (stage: OrderStage) =>
      stage === 'awaiting_payment' || stage === 'expired'
        ? 'pending_payment'
        : stage
    for (const [stage, payment, shipping] of CASES) {
      const set = availableActions(stage, payment, shipping)
      const status = statusOf(stage)
      expect(set.markPaid).toBe(canTransition(status, 'paid', shipping))
      expect(set.cancel).toBe(canTransition(status, 'cancelled', shipping))
      expect(set.ship).toBe(canTransition(status, 'shipped', shipping))
      expect(set.complete).toBe(canTransition(status, 'completed', shipping))
      expect(set.refund).toBe(canTransition(status, 'refunded', shipping))
      expect(set.extend).toBe(canExtend({ status, paymentMethod: payment }))
    }
  })
})
