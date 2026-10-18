// Test support only: builds checksum-valid IBANs at run time from made-up parts,
// so the repository never contains an account number, not even an example one
// (AGENTS.md, "Never commit"). Production code must not import this.

// Whole-number mod 97 of the rearranged IBAN, digit by digit (ISO 13616).
function checkDigits(country: string, bban: string): string {
  const digits = (bban + country + '00').replace(/[A-Z]/g, (letter) =>
    String(letter.charCodeAt(0) - 55),
  )
  let remainder = 0
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  return String(98 - remainder).padStart(2, '0')
}

export function makeIban(country: string, bban: string): string {
  return `${country}${checkDigits(country, bban)}${bban}`
}

// Bank code, then a six-digit prefix and a ten-digit number, padded with zeros.
export function makeCzechIban(
  bank: string,
  prefix: string,
  number: string,
): string {
  return makeIban(
    'CZ',
    bank + prefix.padStart(6, '0') + number.padStart(10, '0'),
  )
}

// The account every test uses. The parts are arbitrary.
export const TEST_ACCOUNT = { bank: '9999', prefix: '12', number: '345678' }
export const TEST_IBAN = makeCzechIban(
  TEST_ACCOUNT.bank,
  TEST_ACCOUNT.prefix,
  TEST_ACCOUNT.number,
)
// How a person writes it: prefix-number/bank.
export const TEST_ACCOUNT_DISPLAY = `${TEST_ACCOUNT.prefix}-${TEST_ACCOUNT.number}/${TEST_ACCOUNT.bank}`

// The same IBAN in groups of four, as printed on paper.
export const groupIban = (iban: string) => iban.replace(/(.{4})(?=.)/g, '$1 ')

// A different last digit: still the right shape, but the checksum no longer fits.
export function breakChecksum(iban: string): string {
  const last = Number(iban.slice(-1))
  return iban.slice(0, -1) + String((last + 1) % 10)
}
