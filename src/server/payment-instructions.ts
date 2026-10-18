import { czechAccountNumber } from './account-number'
import type { OrderStage } from './order-view'
import { buildSpayd } from './spayd'

export type PaymentInstructions =
  | {
      status: 'ready'
      // The QR payload; null when there is nothing to pay.
      spayd: string | null
      iban: string
      account: string
      amountMinor: number
      variableSymbol: string
    }
  // The seller's account is not configured: the page says so.
  | { status: 'not_configured' }

// What a buyer needs to pay a bank-transfer order (spec 6.5, 6.6). Only an
// order that is still waiting for a transfer has any; for every other state the
// answer is null. The variable symbol is the order number.
export function paymentInstructions(
  order: {
    number: number
    totalMinor: number
    paymentMethod: 'bank_transfer' | 'cash_on_pickup'
    stage: OrderStage
  },
  iban: string | undefined,
): PaymentInstructions | null {
  if (order.paymentMethod !== 'bank_transfer') return null
  if (order.stage !== 'awaiting_payment') return null
  if (!iban) return { status: 'not_configured' }

  const variableSymbol = String(order.number)
  return {
    status: 'ready',
    spayd:
      order.totalMinor > 0
        ? buildSpayd({
            iban,
            amountMinor: order.totalMinor,
            variableSymbol,
            message: `Objednavka ${order.number}`,
          })
        : null,
    iban,
    account: czechAccountNumber(iban),
    amountMinor: order.totalMinor,
    variableSymbol,
  }
}
