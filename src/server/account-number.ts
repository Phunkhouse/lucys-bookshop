import { isValidIban, normalizeIban } from './spayd'

// The account in the form Czech banking apps and people use: prefix-number/bank,
// without leading zeros ("12-345678/9999"), from the IBAN
// CZkk BBBB PPPPPP CCCCCCCCCC.
export function czechAccountNumber(iban: string): string {
  const value = normalizeIban(iban)
  if (!isValidIban(value)) throw new Error('Not a valid Czech IBAN')

  const bank = value.slice(4, 8)
  const prefix = value.slice(8, 14).replace(/^0+/, '')
  const number = value.slice(14).replace(/^0+/, '')
  return `${prefix === '' ? '' : `${prefix}-`}${number}/${bank}`
}
