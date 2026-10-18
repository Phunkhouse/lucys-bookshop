import { describe, expect, it } from 'vitest'
import {
  matchesPlacedOrder,
  normalizeShipping,
  orderNumber,
  orderTotalMinor,
  pragueYear,
  shippingCostMinor,
} from './order-rules'

describe('shippingCostMinor', () => {
  it('is free for personal pickup, whatever the settings say', () => {
    expect(shippingCostMinor('pickup', { zasilkovnaPriceMinor: 8900 })).toBe(0)
    expect(shippingCostMinor('pickup', undefined)).toBe(0)
  })

  it('is the flat rate from the settings for Zásilkovna', () => {
    expect(
      shippingCostMinor('zasilkovna', { zasilkovnaPriceMinor: 8900 }),
    ).toBe(8900)
  })

  // Never fall back to free shipping when the seller has not set a price.
  it('is null for Zásilkovna when no price is set', () => {
    expect(
      shippingCostMinor('zasilkovna', { zasilkovnaPriceMinor: null }),
    ).toBeNull()
    expect(shippingCostMinor('zasilkovna', undefined)).toBeNull()
  })
})

describe('orderTotalMinor', () => {
  it('adds the book prices and the shipping', () => {
    expect(orderTotalMinor([18900, 5000], 8900)).toBe(32800)
    expect(orderTotalMinor([18900], 0)).toBe(18900)
  })

  it('refuses an order with no books or a bad amount', () => {
    expect(() => orderTotalMinor([], 0)).toThrow()
    expect(() => orderTotalMinor([100.5], 0)).toThrow()
    expect(() => orderTotalMinor([-1], 0)).toThrow()
    expect(() => orderTotalMinor([100], -1)).toThrow()
  })
})

describe('orderNumber', () => {
  it('is the year followed by four digits of sequence', () => {
    expect(orderNumber(2026, 1)).toBe(20260001)
    expect(orderNumber(2026, 42)).toBe(20260042)
    expect(orderNumber(2026, 9999)).toBe(20269999)
  })

  it('refuses a sequence outside 1 to 9999', () => {
    expect(() => orderNumber(2026, 0)).toThrow()
    expect(() => orderNumber(2026, 10000)).toThrow()
    expect(() => orderNumber(2026, 1.5)).toThrow()
  })
})

describe('pragueYear', () => {
  it('uses the shop clock, not UTC, around New Year', () => {
    expect(pragueYear(new Date('2026-12-31T22:59:00Z'))).toBe(2026)
    expect(pragueYear(new Date('2026-12-31T23:00:00Z'))).toBe(2027)
    expect(pragueYear(new Date('2026-06-30T22:00:00Z'))).toBe(2026)
  })
})

describe('normalizeShipping', () => {
  it('keeps the trimmed pickup point for Zásilkovna', () => {
    expect(normalizeShipping('zasilkovna', '  Z-Box Praha 1  ')).toBe(
      'Z-Box Praha 1',
    )
  })

  it('drops any pickup point for personal pickup', () => {
    expect(normalizeShipping('pickup', 'Z-Box Praha 1')).toBeNull()
    expect(normalizeShipping('pickup', undefined)).toBeNull()
  })
})

describe('matchesPlacedOrder', () => {
  const placed = {
    name: 'Jana Nováková',
    email: 'jana@example.com',
    phone: '+420 601 234 567',
    paymentMethod: 'bank_transfer' as const,
    shippingMethod: 'zasilkovna' as const,
    shippingDetails: 'Z-Box Praha 1',
  }
  const retry = {
    ...placed,
    cart: [{ shortId: 'aaaaaa11' }, { shortId: 'bbbbbb22' }],
  }
  const ordered = ['bbbbbb22', 'aaaaaa11']

  it('accepts the same order, whatever the order of the books', () => {
    expect(matchesPlacedOrder(placed, ordered, retry)).toBe(true)
  })

  it('accepts the pickup point written with spaces around it', () => {
    expect(
      matchesPlacedOrder(placed, ordered, {
        ...retry,
        shippingDetails: '  Z-Box Praha 1 ',
      }),
    ).toBe(true)
  })

  it('ignores a pickup point typed for personal pickup', () => {
    const pickup = {
      ...placed,
      shippingMethod: 'pickup' as const,
      shippingDetails: null,
    }
    expect(
      matchesPlacedOrder(pickup, ordered, {
        ...retry,
        shippingMethod: 'pickup',
        shippingDetails: 'left over from before',
      }),
    ).toBe(true)
  })

  it.each([
    ['name', { name: 'Jiná' }],
    ['email', { email: 'jina@example.com' }],
    ['phone', { phone: '+420 777 000 000' }],
    ['payment', { paymentMethod: 'cash_on_pickup' as const }],
    ['shipping', { shippingMethod: 'pickup' as const }],
    ['pickup point', { shippingDetails: 'Z-Box Brno' }],
    ['a book added', { cart: [...retry.cart, { shortId: 'cccccc33' }] }],
    ['a book removed', { cart: [{ shortId: 'aaaaaa11' }] }],
    [
      'another book',
      { cart: [{ shortId: 'aaaaaa11' }, { shortId: 'dddddd44' }] },
    ],
  ])('refuses a retry with %s changed', (_label, change) => {
    expect(matchesPlacedOrder(placed, ordered, { ...retry, ...change })).toBe(
      false,
    )
  })
})
