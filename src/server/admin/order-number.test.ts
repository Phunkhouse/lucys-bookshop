import { describe, expect, it } from 'vitest'
import { parseOrderNumber } from './order-number'

describe('parseOrderNumber', () => {
  it('reads an order number from the address', () => {
    expect(parseOrderNumber('20260007')).toBe(20260007)
    expect(parseOrderNumber('1')).toBe(1)
  })

  it('accepts the largest number the database holds', () => {
    expect(parseOrderNumber('2147483647')).toBe(2147483647)
  })

  // The address is typed by hand or tampered with, so nothing but plain
  // digits may reach the query.
  it.each([
    '',
    ' ',
    '0',
    '-1',
    '+5',
    '1.5',
    '1e3',
    'abc',
    '20260007abc',
    ' 20260007',
    '0x10',
    '2147483648',
    '99999999999',
    '٢٠٢٦٠٠٠٧',
  ])('refuses %j', (value) => {
    expect(parseOrderNumber(value)).toBeNull()
  })
})
