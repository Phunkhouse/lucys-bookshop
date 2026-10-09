export type IsbnResult =
  { ok: true; value: string | null } | { ok: false; error: 'isbnInvalid' }

function isValidIsbn13(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10 === Number(digits[12])
}

function isValidIsbn10(chars: string): boolean {
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const value = chars[i] === 'X' ? 10 : Number(chars[i])
    sum += value * (10 - i)
  }
  return sum % 11 === 0
}

// Strips hyphens and spaces and checks the checksum, so a mistyped digit is
// caught. Blank means no ISBN. ISBN-10 is kept as typed (not converted).
export function normalizeIsbn(text: string): IsbnResult {
  const cleaned = text.replace(/[\s-]/g, '').toUpperCase()
  if (cleaned === '') return { ok: true, value: null }

  if (/^\d{13}$/.test(cleaned) && isValidIsbn13(cleaned)) {
    return { ok: true, value: cleaned }
  }
  if (/^\d{9}[\dX]$/.test(cleaned) && isValidIsbn10(cleaned)) {
    return { ok: true, value: cleaned }
  }
  return { ok: false, error: 'isbnInvalid' }
}
