import { describe, expect, it } from 'vitest'
import { formatPriceInput, parsePriceToMinor } from './price'

const minor = (text: string) => {
  const result = parsePriceToMinor(text)
  return result.ok ? result.minor : result.error
}

describe('parsePriceToMinor', () => {
  it.each([
    ['189', 18900],
    ['189,50', 18950],
    ['189.5', 18950],
    ['0,99', 99],
    ['  189  ', 18900],
    ['1 250', 125000], // space as thousands separator
    ['1 250', 125000], // non-breaking space, as Czech text often has it
    ['100000', 10_000_000], // the maximum
  ])('reads %j as %i minor units', (text, expected) => {
    expect(minor(text)).toBe(expected)
  })

  // Floating point gets these wrong: 0.29 * 100 = 28.999999999999996.
  it.each([
    ['0,29', 29],
    ['19,99', 1999],
    ['1,15', 115],
    ['8,2', 820],
  ])('is exact for %j (no floating point)', (text, expected) => {
    expect(minor(text)).toBe(expected)
  })

  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['abc', 'priceInvalid'],
    ['-5', 'priceInvalid'],
    ['1e3', 'priceInvalid'],
    ['12,34,56', 'priceInvalid'],
    ['189,', 'priceInvalid'],
    ['189,555', 'priceDecimals'],
    ['0', 'pricePositive'],
    ['0,00', 'pricePositive'],
    ['100000,01', 'priceTooHigh'],
    ['999999999999', 'priceTooHigh'],
  ])('rejects %j with %s', (text, error) => {
    expect(minor(text)).toBe(error)
  })
})

describe('formatPriceInput', () => {
  it.each([
    [18900, '189'],
    [18950, '189,50'],
    [99, '0,99'],
    [125000, '1250'],
    [10_000_000, '100000'],
  ])('shows %i as %j', (value, text) => {
    expect(formatPriceInput(value)).toBe(text)
  })

  it('round-trips: what the form shows parses back to the same price', () => {
    for (const value of [1, 29, 99, 100, 1999, 18900, 18950, 9_999_999]) {
      expect(minor(formatPriceInput(value))).toBe(value)
    }
  })
})
