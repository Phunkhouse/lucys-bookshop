import { encode } from 'uqr'

// The QR modules for a text, true for dark. Error correction M (15%): a phone
// reads a screen or a screenshot easily, and the payment string is short.
export function qrMatrix(value: string): boolean[][] {
  return encode(value, { ecc: 'M', border: 0 }).data
}
