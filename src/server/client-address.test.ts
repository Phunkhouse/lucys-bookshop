import { describe, expect, it } from 'vitest'
import { clientAddress } from './client-address'

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
})

describe('clientAddress', () => {
  it('prefers x-real-ip', () => {
    expect(
      clientAddress(
        headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1' }),
      ),
    ).toBe('203.0.113.7')
  })

  it('falls back to the first x-forwarded-for entry', () => {
    expect(
      clientAddress(headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' })),
    ).toBe('203.0.113.7')
  })

  it('accepts IPv6', () => {
    expect(clientAddress(headers({ 'x-real-ip': '2001:db8::1' }))).toBe(
      '2001:db8::1',
    )
  })

  it.each<Record<string, string>>([
    {},
    { 'x-real-ip': '' },
    { 'x-forwarded-for': ' , ' },
    { 'x-real-ip': 'x'.repeat(200) },
  ])('gives "unknown" when there is nothing usable: %j', (values) => {
    expect(clientAddress(headers(values))).toBe('unknown')
  })
})
