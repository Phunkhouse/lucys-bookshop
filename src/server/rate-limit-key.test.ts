import { describe, expect, it } from 'vitest'
import { rateLimitKey } from './rate-limit-key'

const secret = 'a-secret-of-at-least-thirty-two-characters'

describe('rateLimitKey', () => {
  it.each(['203.0.113.7', '2001:db8::1', '10.0.0.1'])(
    'never contains the address %s',
    (ip) => {
      const key = rateLimitKey('checkout', ip, secret)
      expect(key).not.toContain(ip)
      expect(key).not.toContain(ip.replace(/[.:]/g, ''))
    },
  )

  it('is stable for the same address and scope', () => {
    expect(rateLimitKey('checkout', '203.0.113.7', secret)).toBe(
      rateLimitKey('checkout', '203.0.113.7', secret),
    )
  })

  it('differs by address, scope and secret', () => {
    const base = rateLimitKey('checkout', '203.0.113.7', secret)
    expect(rateLimitKey('checkout', '203.0.113.8', secret)).not.toBe(base)
    expect(rateLimitKey('login', '203.0.113.7', secret)).not.toBe(base)
    expect(rateLimitKey('checkout', '203.0.113.7', `${secret}-other`)).not.toBe(
      base,
    )
  })

  it('starts with the scope, so one scope can be cleared on its own', () => {
    expect(rateLimitKey('checkout', '203.0.113.7', secret)).toMatch(
      /^checkout:[0-9a-f]{64}$/,
    )
  })

  it('refuses an empty address or a weak secret', () => {
    expect(() => rateLimitKey('checkout', '', secret)).toThrow()
    expect(() => rateLimitKey('checkout', '203.0.113.7', 'short')).toThrow()
  })
})
