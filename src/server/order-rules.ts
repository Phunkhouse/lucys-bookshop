// Pure order rules (spec 6.5, 6.7). No database, no Next.

export type ShippingMethod = 'pickup' | 'zasilkovna'

export const MAX_ORDER_SEQUENCE = 9999

// Flat shipping price in minor units, or null when it cannot be offered:
// Zásilkovna without a price set by the seller is unavailable, never free.
export function shippingCostMinor(
  method: ShippingMethod,
  settings: { zasilkovnaPriceMinor: number | null } | undefined,
): number | null {
  if (method === 'pickup') return 0
  return settings?.zasilkovnaPriceMinor ?? null
}

const isMinor = (value: number) => Number.isInteger(value) && value >= 0

// The total comes from server prices only (spec 6.6).
export function orderTotalMinor(
  bookPricesMinor: number[],
  shippingMinor: number,
): number {
  if (bookPricesMinor.length === 0) throw new Error('An order needs books')
  if (!bookPricesMinor.every(isMinor) || !isMinor(shippingMinor)) {
    throw new Error('Amounts must be non-negative integers of minor units')
  }
  return bookPricesMinor.reduce((sum, price) => sum + price, shippingMinor)
}

// 20260001: the year, then four digits of sequence. Also the variable symbol.
export function orderNumber(year: number, sequence: number): number {
  if (
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > MAX_ORDER_SEQUENCE
  ) {
    throw new Error(`Order sequence must be 1 to ${MAX_ORDER_SEQUENCE}`)
  }
  return year * 10000 + sequence
}

const pragueYearFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
})

// The year on the shop's clock, so an order placed just after midnight on
// 1 January gets the new year's number.
export function pragueYear(now: Date): number {
  return Number(pragueYearFormat.format(now))
}

// A retry with a checkout key that already made an order (the answer was lost,
// the buyer pressed again) is the same order only if nothing the buyer chose
// has changed. Prices are not compared: the order keeps the server's.
export function matchesPlacedOrder(
  placed: {
    name: string
    email: string
    phone: string
    paymentMethod: string
    shippingMethod: ShippingMethod
    shippingDetails: string | null
  },
  placedShortIds: string[],
  retry: {
    name: string
    email: string
    phone: string
    paymentMethod: string
    shippingMethod: ShippingMethod
    shippingDetails?: string
    cart: { shortId: string }[]
  },
): boolean {
  const sameBooks =
    placedShortIds.length === retry.cart.length &&
    new Set(placedShortIds).size === placedShortIds.length &&
    retry.cart.every((item) => placedShortIds.includes(item.shortId))
  return (
    sameBooks &&
    placed.name === retry.name &&
    placed.email === retry.email &&
    placed.phone === retry.phone &&
    placed.paymentMethod === retry.paymentMethod &&
    placed.shippingMethod === retry.shippingMethod &&
    placed.shippingDetails ===
      normalizeShipping(retry.shippingMethod, retry.shippingDetails)
  )
}

// The pickup point only belongs to Zásilkovna.
export function normalizeShipping(
  method: ShippingMethod,
  details: string | undefined,
): string | null {
  if (method === 'pickup') return null
  return details?.trim() || null
}
