import {
  newOrderMessage,
  reservationReminderMessage,
  type ExpiringOrder,
  type NotifiableOrder,
} from './notification-messages'
import type { SellerNotifier } from './notifier'

const RESEND_URL = 'https://api.resend.com/emails'

type ResendNotifierOptions = {
  apiKey: string
  from: string
  to: string
  // Injected in tests.
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

// Sends the seller's mail through Resend's HTTP API (no SDK, no dependency).
// Plain text only. Errors say what failed but never carry the key.
export class ResendNotifier implements SellerNotifier {
  private readonly options: ResendNotifierOptions

  constructor(options: ResendNotifierOptions) {
    this.options = options
  }

  async notifyNewOrder(order: NotifiableOrder): Promise<void> {
    const { subject, text } = newOrderMessage(order)
    await this.send(subject, text)
  }

  async notifyReservationExpiring(orders: ExpiringOrder[]): Promise<void> {
    const { subject, text } = reservationReminderMessage(orders)
    await this.send(subject, text)
  }

  private async send(subject: string, text: string): Promise<void> {
    const { apiKey, from, to, timeoutMs = 8000 } = this.options
    const send = this.options.fetch ?? globalThis.fetch

    let response: Response
    try {
      response = await send(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown error'
      throw new Error(`Resend request failed (${reason})`)
    }
    if (!response.ok) {
      throw new Error(`Resend answered with status ${response.status}`)
    }
  }
}
