import { describe, expect, it } from 'vitest'
import { czechAccountNumber } from './account-number'
import {
  breakChecksum,
  groupIban,
  makeCzechIban,
  TEST_ACCOUNT_DISPLAY,
  TEST_IBAN,
} from './test-iban'

describe('czechAccountNumber', () => {
  it('writes the account as prefix-number/bank, without leading zeros', () => {
    expect(czechAccountNumber(TEST_IBAN)).toBe(TEST_ACCOUNT_DISPLAY)
  })

  it('leaves out an empty prefix', () => {
    expect(czechAccountNumber(makeCzechIban('9999', '', '345678'))).toBe(
      '345678/9999',
    )
  })

  it('keeps zeros inside the number and the bank code', () => {
    expect(czechAccountNumber(makeCzechIban('0100', '', '100001'))).toBe(
      '100001/0100',
    )
    expect(czechAccountNumber(makeCzechIban('9999', '10', '2000000'))).toBe(
      '10-2000000/9999',
    )
  })

  it('accepts spaces and lowercase', () => {
    expect(czechAccountNumber(groupIban(TEST_IBAN).toLowerCase())).toBe(
      TEST_ACCOUNT_DISPLAY,
    )
  })

  it('refuses an IBAN that is not valid', () => {
    expect(() => czechAccountNumber(breakChecksum(TEST_IBAN))).toThrow()
  })
})
