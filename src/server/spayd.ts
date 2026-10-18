// QR platba: the Czech SPAYD payment string (spec 6.6). Pure functions, no
// Next or React. Nothing is rounded or parsed through floating point: the
// amount is written from integer minor units (haléře).

export type SpaydInput = {
  iban: string
  amountMinor: number
  // The order number: digits only, at most 10.
  variableSymbol: string
  message: string
}

const MAX_AMOUNT_MINOR = 99_999_999 // 999 999,99 Kč, the SPAYD amount field
const MESSAGE_MAX_LENGTH = 60

export function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase()
}

// Czech IBANs only: the shop pays out to a Czech account and has no use for
// other countries. Length 24, then the mod 97 check of ISO 13616.
export function isValidIban(iban: string): boolean {
  const value = normalizeIban(iban)
  if (!/^CZ\d{22}$/.test(value)) return false

  const rearranged = value.slice(4) + value.slice(0, 4)
  const digits = rearranged.replace(/[A-Z]/g, (letter) =>
    String(letter.charCodeAt(0) - 55),
  )
  // Chunks keep the running remainder small enough for Number.
  let remainder = 0
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

function formatAmount(amountMinor: number): string {
  if (
    !Number.isInteger(amountMinor) ||
    amountMinor <= 0 ||
    amountMinor > MAX_AMOUNT_MINOR
  ) {
    throw new Error('SPAYD amount must be a positive integer of minor units')
  }
  const text = String(amountMinor).padStart(3, '0')
  return `${text.slice(0, -2)}.${text.slice(-2)}`
}

// Banking apps accept a limited set: capitals, digits and a few marks. "*" is
// the field separator, so it must never get through.
function sanitizeMessage(message: string): string {
  return message
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .,\-/:]/g, '')
    .trim()
    .slice(0, MESSAGE_MAX_LENGTH)
    .trim()
}

export function buildSpayd(input: SpaydInput): string {
  const iban = normalizeIban(input.iban)
  if (!isValidIban(iban)) throw new Error('SPAYD needs a valid Czech IBAN')
  if (!/^\d{1,10}$/.test(input.variableSymbol)) {
    throw new Error('SPAYD variable symbol must be 1 to 10 digits')
  }

  const fields = [
    'SPD',
    '1.0',
    `ACC:${iban}`,
    `AM:${formatAmount(input.amountMinor)}`,
    'CC:CZK',
    `X-VS:${input.variableSymbol}`,
  ]
  const message = sanitizeMessage(input.message)
  if (message !== '') fields.push(`MSG:${message}`)
  return fields.join('*')
}
