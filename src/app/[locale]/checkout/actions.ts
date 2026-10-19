'use server'

import { headers } from 'next/headers'
import { after } from 'next/server'
import { env } from '@/config/env'
import { sellerNotifier } from '@/lib/seller-notifier'
import { clientAddress } from '@/server/client-address'
import { submitCheckout, type CheckoutResult } from '@/server/checkout'
import { notifySellerOfNewOrder } from '@/server/notifications'

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
    // After the answer has gone to the buyer, so the seller's mail never slows
    // the checkout. If it fails, the order stays unmarked and the retry job
    // sends it later.
    onPlaced: (placed) =>
      after(async () => {
        await notifySellerOfNewOrder(sellerNotifier, placed.orderId, {
          adminBaseUrl: env.BETTER_AUTH_URL,
          now: new Date(),
        })
      }),
  })
}
