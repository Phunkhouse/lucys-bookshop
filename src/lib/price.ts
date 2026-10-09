// Prices are typed as text ("189", "189,50") and stored as integer minor
// units (haléře). Everything here works on digits, never on floating point:
// 0.29 * 100 is 28.999999999999996.

export const MAX_PRICE_MINOR = 10_000_000 // 100 000 Kč

type PriceError =
  | 'required'
  | 'priceInvalid'
  | 'priceDecimals'
  | 'pricePositive'
  | 'priceTooHigh'

export type PriceResult =
  { ok: true; minor: number } | { ok: false; error: PriceError }

export function parsePriceToMinor(text: string): PriceResult {
  // Spaces (also non-breaking ones) may separate thousands: "1 250".
  const cleaned = text.replace(/\s/g, '')
  if (cleaned === '') return { ok: false, error: 'required' }

  const match = /^(\d+)(?:[.,](\d+))?$/.exec(cleaned)
  if (!match) return { ok: false, error: 'priceInvalid' }

  const [, whole, fraction = ''] = match
  if (fraction.length > 2) return { ok: false, error: 'priceDecimals' }
  // Checked on the text first, so a huge number never reaches Number().
  if (whole.replace(/^0+/, '').length > 7) {
    return { ok: false, error: 'priceTooHigh' }
  }

  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (minor === 0) return { ok: false, error: 'pricePositive' }
  if (minor > MAX_PRICE_MINOR) return { ok: false, error: 'priceTooHigh' }
  return { ok: true, minor }
}

// The text the edit form shows for a stored price: "189" or "189,50".
export function formatPriceInput(minor: number): string {
  const whole = Math.floor(minor / 100)
  const fraction = minor % 100
  return fraction === 0
    ? String(whole)
    : `${whole},${String(fraction).padStart(2, '0')}`
}
