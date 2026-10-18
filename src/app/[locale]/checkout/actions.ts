'use server'

import { headers } from 'next/headers'
import { env } from '@/config/env'
import { clientAddress } from '@/server/client-address'
import { submitCheckout, type CheckoutResult } from '@/server/checkout'

// Anyone may call this: guest checkout. What protects it is the rate limit and
// the validation inside submitCheckout, not a login. The input is checked there
// because a POST can carry anything.
export async function placeOrderAction(
  input: unknown,
): Promise<CheckoutResult> {
  return submitCheckout(input, {
    address: clientAddress(await headers()),
    secret: env.BETTER_AUTH_SECRET,
    now: new Date(),
  })
}
