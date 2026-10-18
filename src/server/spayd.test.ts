import { describe, expect, it } from 'vitest'
import { buildSpayd, isValidIban, normalizeIban } from './spayd'
import { breakChecksum, groupIban, makeIban, TEST_IBAN } from './test-iban'

// Built at run time from made-up parts: no account number is committed.
const IBAN = TEST_IBAN

const base = {
  iban: IBAN,
  amountMinor: 35000,
  variableSymbol: '20260001',
  message: 'Objednavka 20260001',
}

describe('buildSpayd', () => {
  it('builds the exact SPAYD string', () => {
    expect(buildSpayd(base)).toBe(
      `SPD*1.0*ACC:${IBAN}*AM:350.00*CC:CZK*X-VS:20260001*MSG:OBJEDNAVKA 20260001`,
    )
  })

  // Floating point gets these wrong; the amount is built from digits.
  it.each([
    [5, '0.05'],
    [100, '1.00'],
    [29, '0.29'],
    [100000, '1000.00'],
    [99999999, '999999.99'],
    [100_000_000, '1000000.00'],
    [999_999_999, '9999999.99'],
  ])('writes %i minor units as %s', (amountMinor, expected) => {
    expect(buildSpayd({ ...base, amountMinor })).toContain(`*AM:${expected}*`)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000_000])(
    'rejects the amount %s',
    (amountMinor) => {
      expect(() => buildSpayd({ ...base, amountMinor })).toThrow()
    },
  )

  it('accepts an IBAN written with spaces or lowercase', () => {
    expect(buildSpayd({ ...base, iban: groupIban(IBAN).toLowerCase() })).toBe(
      buildSpayd(base),
    )
  })

  it.each([
    breakChecksum(IBAN), // wrong checksum
    IBAN.slice(0, -2), // too short
    `${IBAN}01`, // too long
    makeIban('DE', '0'.repeat(18)), // valid IBAN, but not Czech
    '',
  ])('rejects the IBAN %j', (iban) => {
    expect(() => buildSpayd({ ...base, iban })).toThrow()
  })

  it.each(['', '2026 0001', 'A123', '12345678901', '-1'])(
    'rejects the variable symbol %j',
    (variableSymbol) => {
      expect(() => buildSpayd({ ...base, variableSymbol })).toThrow()
    },
  )

  it('accepts a variable symbol of ten digits', () => {
    expect(buildSpayd({ ...base, variableSymbol: '1234567890' })).toContain(
      '*X-VS:1234567890*',
    )
  })

  it('strips diacritics and uppercases the message', () => {
    const spayd = buildSpayd({ ...base, message: 'Příliš žluťoučký kůň' })
    expect(spayd).toContain('*MSG:PRILIS ZLUTOUCKY KUN')
  })

  it('removes the field separator and other unsafe characters', () => {
    const spayd = buildSpayd({ ...base, message: 'A*B*C%D~E "F"' })
    expect(spayd).toContain('*MSG:ABCDE F')
    // Exactly the six fields, so nothing from the message could add a seventh.
    expect(spayd.split('*')).toHaveLength(7)
  })

  it('cuts the message at 60 characters', () => {
    const spayd = buildSpayd({ ...base, message: 'X'.repeat(100) })
    expect(spayd.split('*MSG:')[1]).toBe('X'.repeat(60))
  })

  it('leaves the message out when nothing usable is left', () => {
    const spayd = buildSpayd({ ...base, message: '*~%' })
    expect(spayd).toBe(`SPD*1.0*ACC:${IBAN}*AM:350.00*CC:CZK*X-VS:20260001`)
  })
})

describe('isValidIban', () => {
  it('accepts a Czech IBAN with a correct checksum', () => {
    expect(isValidIban(IBAN)).toBe(true)
  })

  it('rejects a changed digit', () => {
    expect(isValidIban(breakChecksum(IBAN))).toBe(false)
  })
})

describe('normalizeIban', () => {
  it('removes spaces and uppercases', () => {
    expect(normalizeIban(` ${groupIban(IBAN).toLowerCase()} `)).toBe(IBAN)
  })
})
