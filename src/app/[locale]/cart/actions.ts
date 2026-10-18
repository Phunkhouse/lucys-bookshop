'use server'

import { cartInputSchema } from '@/lib/cart-schema'
import { validateCart, type CartValidation } from '@/server/cart'

export type ValidateCartResult =
  { ok: true; validation: CartValidation } | { ok: false }

// Anyone may call this, like the cart itself: it only reads. The input is
// checked here because a POST can carry anything.
export async function validateCartAction(
  input: unknown,
): Promise<ValidateCartResult> {
  const parsed = cartInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false }
  return { ok: true, validation: await validateCart(parsed.data, new Date()) }
}
