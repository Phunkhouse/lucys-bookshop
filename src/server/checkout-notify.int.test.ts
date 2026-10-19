import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { books, orders } from '@/server/db/schema'
import { createBook, resetDatabase } from '@/server/db/test-helpers'
import { submitCheckout, type CheckoutContext } from './checkout'
import type { PlacedOrder } from './orders'

const now = new Date('2026-10-18T12:00:30.000Z')
const secret = 'a-secret-of-at-least-thirty-two-characters'

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

function context(
  onPlaced?: (placed: PlacedOrder) => void,
  address = '203.0.113.7',
): CheckoutContext {
  return { address, secret, now, onPlaced }
}

describe('submitCheckout: telling the seller', () => {
  it('reports a new order once, with what the notification needs', async () => {
    const book = await createBook()
    const onPlaced = vi.fn()

    const result = await submitCheckout(input([book]), context(onPlaced))

    expect(result.ok).toBe(true)
    const [order] = await db.select().from(orders)
    expect(onPlaced).toHaveBeenCalledTimes(1)
    expect(onPlaced.mock.calls[0][0]).toMatchObject({
      orderId: order.id,
      number: order.number,
      replayed: false,
    })
  })

  // Pressing the button twice returns the same order: that is not a new order.
  it('does not report an order the same key made before', async () => {
    const book = await createBook()
    const same = input([book])
    await submitCheckout(same, context(vi.fn()))
    const onPlaced = vi.fn()

    const again = await submitCheckout(same, context(onPlaced))

    expect(again.ok).toBe(true)
    expect(onPlaced).not.toHaveBeenCalled()
  })

  it('does not report anything when no order was made', async () => {
    const book = await createBook({ status: 'hidden' })
    const onPlaced = vi.fn()

    const unavailable = await submitCheckout(input([book]), context(onPlaced))
    const invalid = await submitCheckout(
      input([book], { acceptTerms: false }),
      context(onPlaced),
    )

    expect(unavailable).toEqual({ ok: false, reason: 'unavailable' })
    expect(invalid).toEqual({ ok: false, reason: 'invalid' })
    expect(onPlaced).not.toHaveBeenCalled()
  })

  it('does not report an attempt that was rate limited', async () => {
    const book = await createBook()
    const onPlaced = vi.fn()
    for (let i = 0; i < 10; i++) {
      await submitCheckout('x', context(undefined, '203.0.113.99'))
    }

    const result = await submitCheckout(
      input([book]),
      context(onPlaced, '203.0.113.99'),
    )

    expect(result).toMatchObject({ ok: false, reason: 'rate_limited' })
    expect(onPlaced).not.toHaveBeenCalled()
  })

  // The notification is a side effect: whatever goes wrong with it, the buyer
  // still has their order.
  it('still answers ok when reporting the order throws', async () => {
    const book = await createBook()

    const result = await submitCheckout(
      input([book]),
      context(() => {
        throw new Error('notifier setup is broken')
      }),
    )

    expect(result.ok).toBe(true)
    expect(await db.select().from(orders)).toHaveLength(1)
  })

  it('works without a callback', async () => {
    const book = await createBook()

    const result = await submitCheckout(input([book]), context())

    expect(result.ok).toBe(true)
  })
})
