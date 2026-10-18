import { checkoutInputSchema } from '@/lib/checkout-schema'
import { PlaceOrderError, placeOrder } from './orders'
import { hitRateLimit, type RateLimitRule } from './rate-limit'
import { rateLimitKey } from './rate-limit-key'
import { BooksUnavailableError } from './reservations'

// Spec 8. Generous for a shop with a handful of orders a week, but enough to
// stop one address from reserving the whole shop in a loop. Buyers behind one
// shared address (a school, a mobile carrier) still fit.
export const CHECKOUT_RATE_LIMIT: RateLimitRule = {
  limit: 10,
  windowMs: 10 * 60 * 1000,
}

export type CheckoutContext = {
  address: string
  // The server secret the address is hashed with.
  secret: string
  now: Date
}

// What the browser is told. Reasons only, never details about other buyers.
export type CheckoutResult =
  | { ok: true; publicToken: string }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'rate_limited'; retryAfterMs: number }
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'price_changed' }
  | { ok: false; reason: 'shipping_unavailable' }

// The checkout entry point behind the server action: limit, validate, order.
// Unexpected errors (database down) are not caught here; the action fails and
// the form shows its generic message.
export async function submitCheckout(
  raw: unknown,
  { address, secret, now }: CheckoutContext,
): Promise<CheckoutResult> {
  // Counted before anything else, so invalid requests cost an attacker too.
  const limit = await hitRateLimit(
    rateLimitKey('checkout', address, secret),
    CHECKOUT_RATE_LIMIT,
    now,
  )
  if (!limit.allowed) {
    return {
      ok: false,
      reason: 'rate_limited',
      retryAfterMs: limit.retryAfterMs,
    }
  }

  const parsed = checkoutInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: 'invalid' }

  try {
    const placed = await placeOrder(parsed.data, now)
    return { ok: true, publicToken: placed.publicToken }
  } catch (error) {
    if (error instanceof BooksUnavailableError) {
      return { ok: false, reason: 'unavailable' }
    }
    if (error instanceof PlaceOrderError) {
      return { ok: false, reason: error.code }
    }
    throw error
  }
}
