import { describe, expect, it } from 'vitest'
import { isAuthorized } from './job-auth'

const secret = 'a-job-secret-of-at-least-thirty-two-characters'

describe('isAuthorized', () => {
  it('accepts the secret as a bearer token', () => {
    expect(isAuthorized(`Bearer ${secret}`, secret)).toBe(true)
  })

  it('does not mind the case of the scheme', () => {
    expect(isAuthorized(`bearer ${secret}`, secret)).toBe(true)
    expect(isAuthorized(`BEARER ${secret}`, secret)).toBe(true)
  })

  it.each([
    ['no header', null],
    ['an empty header', ''],
    ['only the scheme', 'Bearer'],
    ['the scheme and a space', 'Bearer '],
    ['the secret without a scheme', secret],
    ['another scheme', `Basic ${secret}`],
    ['a wrong secret', 'Bearer a-different-secret-of-the-same-length-xx'],
    ['a prefix of the secret', `Bearer ${secret.slice(0, -1)}`],
    ['the secret with something added', `Bearer ${secret}x`],
    ['a much longer token', `Bearer ${secret.repeat(50)}`],
    ['a single character', 'Bearer a'],
    ['the secret twice', `Bearer ${secret} ${secret}`],
  ])('refuses %s', (_label, header) => {
    expect(isAuthorized(header, secret)).toBe(false)
  })

  // Without a configured secret nothing may pass, not even an empty token.
  it('refuses everything when no secret is configured', () => {
    for (const header of [
      null,
      '',
      'Bearer',
      'Bearer ',
      'Bearer undefined',
      `Bearer ${secret}`,
    ]) {
      expect(isAuthorized(header, undefined)).toBe(false)
      expect(isAuthorized(header, '')).toBe(false)
    }
  })
})
