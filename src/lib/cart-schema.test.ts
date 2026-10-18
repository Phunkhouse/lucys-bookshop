import { describe, expect, it } from 'vitest'
import { cartInputSchema, MAX_CART_ITEMS } from './cart-schema'

const seen = { shortId: 'abc12345', priceMinorSeen: 15000 }

describe('cartInputSchema', () => {
  it('accepts a normal cart and an empty one', () => {
    expect(cartInputSchema.safeParse([seen]).success).toBe(true)
    expect(cartInputSchema.safeParse([]).success).toBe(true)
  })

  it.each([
    ['a short id with capitals', { shortId: 'ABC12345', priceMinorSeen: 1 }],
    ['a short id that is too short', { shortId: 'abc', priceMinorSeen: 1 }],
    ['a short id with a symbol', { shortId: 'abc-2345', priceMinorSeen: 1 }],
    ['a negative price', { shortId: 'abc12345', priceMinorSeen: -1 }],
    ['a fractional price', { shortId: 'abc12345', priceMinorSeen: 1.5 }],
    ['a missing price', { shortId: 'abc12345' }],
  ])('rejects %s', (_name, item) => {
    expect(cartInputSchema.safeParse([item]).success).toBe(false)
  })

  it('rejects a cart over the limit and accepts one at the limit', () => {
    const item = (i: number) => ({
      shortId: `b${String(i).padStart(7, '0')}`,
      priceMinorSeen: 1,
    })
    const cart = (n: number) => Array.from({ length: n }, (_, i) => item(i))
    expect(cartInputSchema.safeParse(cart(MAX_CART_ITEMS)).success).toBe(true)
    expect(cartInputSchema.safeParse(cart(MAX_CART_ITEMS + 1)).success).toBe(
      false,
    )
  })

  it('rejects something that is not a list', () => {
    expect(cartInputSchema.safeParse({ shortId: 'abc12345' }).success).toBe(
      false,
    )
    expect(cartInputSchema.safeParse(null).success).toBe(false)
  })
})
