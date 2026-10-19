import { describe, expect, it } from 'vitest'
import { checkoutInputSchema, SHIPPING_DETAILS_MAX } from './checkout-schema'

const valid = {
  cart: [{ shortId: 'abc123', priceMinorSeen: 18900 }],
  name: 'Jana Nováková',
  email: 'jana@example.com',
  phone: '+420 601 234 567',
  shippingMethod: 'pickup',
  paymentMethod: 'bank_transfer',
  acceptTerms: true,
  acceptPrivacy: true,
  checkoutKey: '3f6c1c52-6f6e-4c1e-9d0e-8a1f4f0b7c11',
  shippingMinorSeen: 0,
}

const issuePaths = (input: unknown) => {
  const result = checkoutInputSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
}

describe('checkoutInputSchema', () => {
  it('accepts a valid pickup order', () => {
    expect(checkoutInputSchema.safeParse(valid).success).toBe(true)
  })

  it.each(['name', 'email', 'phone', 'checkoutKey'])('requires %s', (field) => {
    const input: Record<string, unknown> = { ...valid }
    delete input[field]
    expect(issuePaths(input)).toContain(field)
  })

  it.each(['', '   ', 'jana', 'jana@', '@example.com', 'a b@example.com'])(
    'rejects the email %j',
    (email) => {
      expect(issuePaths({ ...valid, email })).toContain('email')
    },
  )

  it.each(['', '123', 'abc', '+420 601 234 567 890 123 456'])(
    'rejects the phone %j',
    (phone) => {
      expect(issuePaths({ ...valid, phone })).toContain('phone')
    },
  )

  it('limits the length of every free-text field', () => {
    const spaces = ' '.repeat(10_000)
    expect(
      issuePaths({ ...valid, phone: `+420601234567${spaces}1` }),
    ).toContain('phone')
    expect(
      issuePaths({ ...valid, phone: `+420 601 ${'1 '.repeat(20)}` }),
    ).toContain('phone')
    expect(issuePaths({ ...valid, name: 'x'.repeat(101) })).toContain('name')
    expect(
      issuePaths({ ...valid, email: `${'a'.repeat(200)}@example.com` }),
    ).toContain('email')
    expect(
      issuePaths({
        ...valid,
        shippingMethod: 'zasilkovna',
        shippingDetails: 'x'.repeat(201),
      }),
    ).toContain('shippingDetails')
  })

  it('requires both consent boxes to be ticked', () => {
    expect(issuePaths({ ...valid, acceptTerms: false })).toContain(
      'acceptTerms',
    )
    expect(issuePaths({ ...valid, acceptPrivacy: false })).toContain(
      'acceptPrivacy',
    )
    expect(issuePaths({ ...valid, acceptTerms: undefined })).toContain(
      'acceptTerms',
    )
  })

  it('rejects an empty cart', () => {
    expect(issuePaths({ ...valid, cart: [] })).toContain('cart')
  })

  it('rejects the same book twice', () => {
    const line = { shortId: 'abc123', priceMinorSeen: 100 }
    expect(issuePaths({ ...valid, cart: [line, line] })).toContain('cart')
  })

  it('rejects a filled honeypot', () => {
    expect(issuePaths({ ...valid, website: 'http://spam.example' })).toContain(
      'website',
    )
    expect(issuePaths({ ...valid, website: '' })).toEqual([])
  })

  it('needs a pickup point for Zásilkovna', () => {
    const zasilkovna = { ...valid, shippingMethod: 'zasilkovna' }
    expect(issuePaths(zasilkovna)).toContain('shippingDetails')
    expect(issuePaths({ ...zasilkovna, shippingDetails: '   ' })).toContain(
      'shippingDetails',
    )
    expect(
      issuePaths({ ...zasilkovna, shippingDetails: 'Z-Box Praha 1, Dlouhá 5' }),
    ).toEqual([])
  })

  it('allows cash only with personal pickup', () => {
    expect(issuePaths({ ...valid, paymentMethod: 'cash_on_pickup' })).toEqual(
      [],
    )
    expect(
      issuePaths({
        ...valid,
        shippingMethod: 'zasilkovna',
        shippingDetails: 'Z-Box Praha 1',
        paymentMethod: 'cash_on_pickup',
      }),
    ).toContain('paymentMethod')
  })

  it('rejects unknown methods', () => {
    expect(issuePaths({ ...valid, shippingMethod: 'drone' })).toContain(
      'shippingMethod',
    )
    expect(issuePaths({ ...valid, paymentMethod: 'card' })).toContain(
      'paymentMethod',
    )
  })

  it('requires the shipping price the buyer saw, as whole minor units', () => {
    const without: Record<string, unknown> = { ...valid }
    delete without.shippingMinorSeen
    expect(issuePaths(without)).toContain('shippingMinorSeen')
    expect(issuePaths({ ...valid, shippingMinorSeen: -1 })).toContain(
      'shippingMinorSeen',
    )
    expect(issuePaths({ ...valid, shippingMinorSeen: 89.5 })).toContain(
      'shippingMinorSeen',
    )
    expect(issuePaths({ ...valid, shippingMinorSeen: 8900 })).toEqual([])
  })

  it('rejects a checkout key that is not a uuid', () => {
    expect(issuePaths({ ...valid, checkoutKey: 'abc' })).toContain(
      'checkoutKey',
    )
  })
})

// The form's input and the server's check share one limit, so they cannot drift.
describe('SHIPPING_DETAILS_MAX', () => {
  const zasilkovna = { ...valid, shippingMethod: 'zasilkovna' }

  it('is what the server accepts, and not one character more', () => {
    expect(
      issuePaths({
        ...zasilkovna,
        shippingDetails: 'x'.repeat(SHIPPING_DETAILS_MAX),
      }),
    ).not.toContain('shippingDetails')
    expect(
      issuePaths({
        ...zasilkovna,
        shippingDetails: 'x'.repeat(SHIPPING_DETAILS_MAX + 1),
      }),
    ).toContain('shippingDetails')
  })

  it('counts the text without the spaces around it', () => {
    expect(
      issuePaths({
        ...zasilkovna,
        shippingDetails: `  ${'x'.repeat(SHIPPING_DETAILS_MAX)}  `,
      }),
    ).not.toContain('shippingDetails')
  })
})
