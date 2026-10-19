import { env } from '@/config/env'
import { shopConfig } from '@/config/shop'
import { createSellerNotifier } from '@/server/notifier'

// Tells the seller about orders: by email through Resend when the key and the
// addresses are set, otherwise only in the log.
export const sellerNotifier = createSellerNotifier({
  apiKey: env.RESEND_API_KEY,
  to: env.SELLER_NOTIFY_EMAIL,
  from: env.NOTIFY_FROM_EMAIL
    ? `${shopConfig.name} <${env.NOTIFY_FROM_EMAIL}>`
    : undefined,
})
