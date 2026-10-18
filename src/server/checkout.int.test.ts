import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { books, orders, requestLimits, settings } from '@/server/db/schema'
import { createBook, resetDatabase } from '@/server/db/test-helpers'
import {
  CHECKOUT_RATE_LIMIT,
  submitCheckout,
  type CheckoutContext,
} from './checkout'

const now = new Date('2026-10-18T12:00:30.000Z')
const secret = 'a-secret-of-at-least-thirty-two-characters'
const context = (address = '203.0.113.7'): CheckoutContext => ({
  address,
  secret,
  now,
})

beforeEach(resetDatabase)

type BookRow = typeof books.$inferSelect

let keyCounter = 0
function input(bookRows: BookRow[], overrides: Record<string, unknown> = {}) {
  return {
    cart: bookRows.map((b) => ({
      shortId: b.shortId,
      priceMinorSeen: b.priceMinor,
    })),
    name: 'Jana Nováková',
    email: 'jana@example.com',
    phone: '+420 601 234 567',
    shippingMethod: 'pickup',
    paymentMethod: 'bank_transfer',
    acceptTerms: true,
    acceptPrivacy: true,
    shippingMinorSeen: 0,
    checkoutKey: `00000000-0000-4000-8000-${String(++keyCounter).padStart(12, '0')}`,
    ...overrides,
  }
}

describe('submitCheckout', () => {
  it('places the order and returns the link token', async () => {
    const book = await createBook()

    const result = await submitCheckout(input([book]), context())

    const [order] = await db.select().from(orders)
    expect(result).toEqual({ ok: true, publicToken: order.publicToken })
  })

  it('answers "invalid" and creates nothing for input the form never sends', async () => {
    const book = await createBook()
    const bad = await submitCheckout(
      input([book], { acceptTerms: false }),
      context(),
    )
    const garbage = await submitCheckout('not an object', context())
    expect(bad).toEqual({ ok: false, reason: 'invalid' })
    expect(garbage).toEqual({ ok: false, reason: 'invalid' })
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('answers the same for a filled honeypot, so a bot learns nothing', async () => {
    const book = await createBook()
    const result = await submitCheckout(
      input([book], { website: 'http://spam.example' }),
      context(),
    )
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('refuses the attempt after the limit, per address', async () => {
    for (let i = 0; i < CHECKOUT_RATE_LIMIT.limit; i++) {
      expect(await submitCheckout({}, context())).toEqual({
        ok: false,
        reason: 'invalid',
      })
    }
    const refused = await submitCheckout({}, context())
    expect(refused).toEqual({
      ok: false,
      reason: 'rate_limited',
      retryAfterMs: expect.any(Number),
    })

    // Another address is unaffected, and a refused attempt reserves nothing.
    const book = await createBook()
    const other = await submitCheckout(input([book]), context('198.51.100.9'))
    expect(other.ok).toBe(true)
    const blocked = await submitCheckout(input([await createBook()]), context())
    expect(blocked).toMatchObject({ ok: false, reason: 'rate_limited' })
    expect(await db.select().from(orders)).toHaveLength(1)
  })

  it('never stores the address', async () => {
    await submitCheckout({}, context('203.0.113.7'))
    const rows = await db.select().from(requestLimits)
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toMatch(/^checkout:[0-9a-f]{64}$/)
    expect(JSON.stringify(rows)).not.toContain('203.0.113.7')
  })

  it('answers "unavailable" when a book was taken meanwhile', async () => {
    const book = await createBook()
    const first = await submitCheckout(input([book]), context())
    expect(first.ok).toBe(true)

    const second = await submitCheckout(input([book]), context('198.51.100.9'))

    expect(second).toEqual({ ok: false, reason: 'unavailable' })
    expect(await db.select().from(orders)).toHaveLength(1)
  })

  it('answers "price_changed" when the price moved', async () => {
    const book = await createBook({ priceMinor: 10000 })
    const stale = input([book])
    await db.update(books).set({ priceMinor: 12000 })

    expect(await submitCheckout(stale, context())).toEqual({
      ok: false,
      reason: 'price_changed',
    })
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('answers "shipping_unavailable" for Zásilkovna without a price', async () => {
    const book = await createBook()
    const zasilkovna = input([book], {
      shippingMethod: 'zasilkovna',
      shippingDetails: 'Z-Box Praha 1',
      shippingMinorSeen: 8900,
    })
    expect(await submitCheckout(zasilkovna, context())).toEqual({
      ok: false,
      reason: 'shipping_unavailable',
    })

    await db.insert(settings).values({ zasilkovnaPriceMinor: 8900 })
    expect((await submitCheckout(zasilkovna, context())).ok).toBe(true)
  })

  it('answers "shipping_changed" when the shipping price moved', async () => {
    await db.insert(settings).values({ zasilkovnaPriceMinor: 12900 })
    const book = await createBook()
    const stale = input([book], {
      shippingMethod: 'zasilkovna',
      shippingDetails: 'Z-Box Praha 1',
      shippingMinorSeen: 8900,
    })
    expect(await submitCheckout(stale, context())).toEqual({
      ok: false,
      reason: 'shipping_changed',
    })
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('returns the same link when the buyer clicks twice', async () => {
    const book = await createBook()
    const same = input([book])
    const first = await submitCheckout(same, context())
    const second = await submitCheckout(same, context())
    expect(second).toEqual(first)
    expect(await db.select().from(orders)).toHaveLength(1)
  })
})
