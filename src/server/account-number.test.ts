import { describe, expect, it } from 'vitest'
import { czechAccountNumber } from './account-number'

describe('czechAccountNumber', () => {
  it('writes the account as prefix-number/bank, without leading zeros', () => {
    expect(czechAccountNumber('CZ6508000000192000145399')).toBe(
      '19-2000145399/0800',
    )
  })

  it('leaves out an empty prefix', () => {
    expect(czechAccountNumber('CZ7708000000000012345678')).toBe('12345678/0800')
  })

  it('keeps zeros inside the number and the bank code', () => {
    expect(czechAccountNumber('CZ6901000000000000100001')).toBe('100001/0100')
  })

  it('accepts spaces and lowercase', () => {
    expect(czechAccountNumber('cz65 0800 0000 1920 0014 5399')).toBe(
      '19-2000145399/0800',
    )
  })

  it('refuses an IBAN that is not valid', () => {
    expect(() => czechAccountNumber('CZ6508000000192000145390')).toThrow()
  })
})
