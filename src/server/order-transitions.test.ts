import { describe, expect, it } from 'vitest'
import {
  canExtend,
  canTransition,
  EXTENSION_MS,
  extendedDeadline,
  normalizeNote,
  normalizeTrackingNumber,
  type OrderStatus,
} from './order-transitions'
import type { ShippingMethod } from './order-rules'

const STATUSES: OrderStatus[] = [
  'pending_payment',
  'paid',
  'shipped',
  'completed',
  'cancelled',
  'refunded',
]
const METHODS: ShippingMethod[] = ['pickup', 'zasilkovna']

// Every move the admin may make by hand (marking paid goes through
// PaymentConfirmer, but the table knows it too). Anything else is forbidden.
const ALLOWED: [OrderStatus, OrderStatus, ShippingMethod | 'both'][] = [
  ['pending_payment', 'paid', 'both'],
  ['pending_payment', 'cancelled', 'both'],
  // Shipped means a parcel really went out, so only Zásilkovna orders ship.
  ['paid', 'shipped', 'zasilkovna'],
  // A pickup is handed over: paid, then completed, with nothing in between.
  ['paid', 'completed', 'pickup'],
  ['paid', 'refunded', 'both'],
  ['shipped', 'completed', 'both'],
  ['shipped', 'refunded', 'both'],
  ['completed', 'refunded', 'both'],
]

describe('canTransition', () => {
  it('allows exactly the listed moves and no others', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        for (const method of METHODS) {
          const expected = ALLOWED.some(
            ([f, t, m]) =>
              f === from && t === to && (m === 'both' || m === method),
          )
          expect(
            canTransition(from, to, method),
            `${from} -> ${to} (${method})`,
          ).toBe(expected)
        }
      }
    }
  })

  it('treats cancelled and refunded as final', () => {
    for (const final of ['cancelled', 'refunded'] as const) {
      for (const to of STATUSES) {
        for (const method of METHODS) {
          expect(canTransition(final, to, method)).toBe(false)
        }
      }
    }
  })
})

describe('canExtend', () => {
  it('is only for a pending cash on pickup order', () => {
    expect(
      canExtend({ status: 'pending_payment', paymentMethod: 'cash_on_pickup' }),
    ).toBe(true)
    expect(
      canExtend({ status: 'pending_payment', paymentMethod: 'bank_transfer' }),
    ).toBe(false)
    for (const status of STATUSES.filter((s) => s !== 'pending_payment')) {
      expect(canExtend({ status, paymentMethod: 'cash_on_pickup' })).toBe(false)
    }
  })
})

describe('extendedDeadline', () => {
  const now = new Date('2026-10-18T12:00:00.000Z')
  const HOUR = 60 * 60 * 1000

  it('adds 48 hours to a deadline that is still ahead', () => {
    const current = new Date(now.getTime() + 5 * HOUR)
    expect(extendedDeadline(now, current)).toEqual(
      new Date(current.getTime() + EXTENSION_MS),
    )
  })

  it('counts from now when the deadline has already passed', () => {
    const current = new Date(now.getTime() - 3 * HOUR)
    expect(extendedDeadline(now, current)).toEqual(
      new Date(now.getTime() + EXTENSION_MS),
    )
  })

  it('is exactly 48 hours', () => {
    expect(EXTENSION_MS).toBe(48 * HOUR)
  })
})

describe('normalizeTrackingNumber', () => {
  it('trims the number', () => {
    expect(normalizeTrackingNumber('  Z123 456 789  ')).toBe('Z123 456 789')
  })

  it('returns null for anything not usable', () => {
    expect(normalizeTrackingNumber('')).toBeNull()
    expect(normalizeTrackingNumber('   ')).toBeNull()
    expect(normalizeTrackingNumber('x'.repeat(101))).toBeNull()
    expect(normalizeTrackingNumber('Z123\nZ456')).toBeNull()
    expect(normalizeTrackingNumber('Z123\u0000')).toBeNull()
  })

  it('accepts exactly 100 characters', () => {
    expect(normalizeTrackingNumber('x'.repeat(100))).toBe('x'.repeat(100))
  })
})

describe('normalizeNote', () => {
  it('trims the note', () => {
    expect(normalizeNote('  zaplatila o 50 Kč méně ')).toEqual({
      ok: true,
      value: 'zaplatila o 50 Kč méně',
    })
  })

  it('turns an empty note into null, which clears it', () => {
    expect(normalizeNote('')).toEqual({ ok: true, value: null })
    expect(normalizeNote('  \n ')).toEqual({ ok: true, value: null })
  })

  it('keeps line breaks inside the note', () => {
    expect(normalizeNote('a\nb')).toEqual({ ok: true, value: 'a\nb' })
  })

  it('refuses a note over 2000 characters', () => {
    expect(normalizeNote('x'.repeat(2000))).toEqual({
      ok: true,
      value: 'x'.repeat(2000),
    })
    expect(normalizeNote('x'.repeat(2001))).toEqual({ ok: false })
  })
})
