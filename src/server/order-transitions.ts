// Pure rules for moving an order through its life (spec 6.4, 6.7). No database, no Next.
import type { ShippingMethod } from './order-rules'

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'shipped'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export type PaymentMethod = 'bank_transfer' | 'cash_on_pickup'

type Move = { to: OrderStatus; only?: ShippingMethod }

// Which move is allowed from which status. Marking paid goes through
// PaymentConfirmer, but the table knows it too. `cancelled` and `refunded` are final.
const MOVES: Record<OrderStatus, Move[]> = {
  pending_payment: [{ to: 'paid' }, { to: 'cancelled' }],
  paid: [
    // Shipped means a parcel went out, so only Zásilkovna orders ship. A
    // pickup is handed over: paid, then completed, nothing in between.
    { to: 'shipped', only: 'zasilkovna' },
    { to: 'completed', only: 'pickup' },
    { to: 'refunded' },
  ],
  shipped: [{ to: 'completed' }, { to: 'refunded' }],
  completed: [{ to: 'refunded' }],
  cancelled: [],
  refunded: [],
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  shippingMethod: ShippingMethod,
): boolean {
  return MOVES[from].some(
    (move) => move.to === to && (!move.only || move.only === shippingMethod),
  )
}

// Only the seller extends, and only a cash on pickup reservation that is still
// waiting (spec 6.4). A bank transfer order is not extended.
export function canExtend(order: {
  status: OrderStatus
  paymentMethod: PaymentMethod
}): boolean {
  return (
    order.status === 'pending_payment' &&
    order.paymentMethod === 'cash_on_pickup'
  )
}

export const EXTENSION_MS = 48 * 60 * 60 * 1000

// 48 hours from the later of now and the current deadline, so an extension
// never shortens a deadline that is further away.
export function extendedDeadline(now: Date, currentExpiresAt: Date): Date {
  const start = Math.max(now.getTime(), currentExpiresAt.getTime())
  return new Date(start + EXTENSION_MS)
}

const MAX_TRACKING_LENGTH = 100
const MAX_NOTE_LENGTH = 2000

// The number the seller pastes from the Zásilkovna app. Null means not usable:
// empty, too long, or containing control characters (line breaks included).
export function normalizeTrackingNumber(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0 || value.length > MAX_TRACKING_LENGTH) return null
  if (/\p{Cc}/u.test(value)) return null
  return value
}

export type NormalizedNote = { ok: true; value: string | null } | { ok: false }

// An empty note clears it. Line breaks inside the note are kept.
export function normalizeNote(raw: string): NormalizedNote {
  const value = raw.trim()
  if (value.length > MAX_NOTE_LENGTH) return { ok: false }
  return { ok: true, value: value.length === 0 ? null : value }
}
