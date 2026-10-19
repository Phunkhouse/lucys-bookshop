import { ConsoleNotifier } from './console-notifier'
import type { NotifiableOrder } from './notification-messages'
import { ResendNotifier } from './resend-notifier'

// How the seller hears about orders (spec 6.8). Behind an interface so the
// provider can change (another mail service, a Telegram bot) without touching
// the order logic. The reservation-expiring reminder is added here with the job
// that sends it.
export interface SellerNotifier {
  // Rejects when the message could not be sent.
  notifyNewOrder(order: NotifiableOrder): Promise<void>
}

export type NotifierConfig = {
  apiKey?: string
  // The seller's own address.
  to?: string
  // The sender, as written in the From header.
  from?: string
}

// With no key, messages are only logged: development, CI and previews need no
// secrets. A key without both addresses is a setup mistake and fails at once,
// not on the first order.
export function createSellerNotifier(config: NotifierConfig): SellerNotifier {
  if (!config.apiKey) return new ConsoleNotifier()
  if (!config.to || !config.from) {
    throw new Error(
      'Sending notifications needs a recipient and a sender address as well as the API key.',
    )
  }
  return new ResendNotifier({
    apiKey: config.apiKey,
    to: config.to,
    from: config.from,
  })
}
