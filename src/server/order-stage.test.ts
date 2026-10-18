import { describe, expect, it } from 'vitest'
import {
  EXPIRING_SOON_MS,
  isExpiringSoon,
  orderStage,
  type OrderStage,
} from './order-stage'
import type { OrderStatus } from './order-transitions'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

describe('orderStage', () => {
  it('is awaiting payment for an unpaid order before its deadline', () => {
    expect(orderStage('pending_payment', at(HOUR), now)).toBe(
      'awaiting_payment',
    )
  })

  // Same rule as a book's reservation: at exactly the deadline it still holds.
  it('is still awaiting payment at exactly the deadline', () => {
    expect(orderStage('pending_payment', now, now)).toBe('awaiting_payment')
  })

  it('is expired one millisecond after the deadline', () => {
    expect(orderStage('pending_payment', at(-1), now)).toBe('expired')
  })

  it.each([
    'paid',
    'shipped',
    'completed',
    'cancelled',
    'refunded',
  ] as const satisfies OrderStatus[])(
    'passes %s through, whatever the deadline',
    (status) => {
      expect(orderStage(status, at(-100 * HOUR), now)).toBe(status)
      expect(orderStage(status, at(100 * HOUR), now)).toBe(status)
    },
  )
})

describe('isExpiringSoon', () => {
  it('is 24 hours, as the seller reminder (spec 6.4)', () => {
    expect(EXPIRING_SOON_MS).toBe(24 * HOUR)
  })

  it('is true at exactly 24 hours left', () => {
    expect(isExpiringSoon('awaiting_payment', at(24 * HOUR), now)).toBe(true)
  })

  it('is true just before the deadline and at the deadline', () => {
    expect(isExpiringSoon('awaiting_payment', at(1), now)).toBe(true)
    expect(isExpiringSoon('awaiting_payment', now, now)).toBe(true)
  })

  it('is false with more than 24 hours left', () => {
    expect(isExpiringSoon('awaiting_payment', at(24 * HOUR + 1), now)).toBe(
      false,
    )
  })

  it.each([
    'expired',
    'paid',
    'shipped',
    'completed',
    'cancelled',
    'refunded',
  ] as const satisfies OrderStage[])('is false for a %s order', (stage) => {
    expect(isExpiringSoon(stage, at(HOUR), now)).toBe(false)
  })
})
