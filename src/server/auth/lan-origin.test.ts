import { describe, expect, it } from 'vitest'
import { lanOriginOf, trustedOriginsFor } from './lan-origin'

// Only a home-network address (192.168.x.y) is trusted, and only in development
// (see the PR). Wildcard patterns are not used: Better Auth's `*` also matches
// across dots, so "192.168.1.1.evil.com" would pass a pattern.

describe('lanOriginOf', () => {
  it.each([
    'http://192.168.68.54:3000',
    'http://192.168.0.1:3000',
    'http://192.168.255.255:3000',
    'http://192.168.1.20:3001', // any port
    'http://192.168.1.20:80',
    'http://192.168.1.20', // no port
  ])('trusts %s', (origin) => {
    expect(lanOriginOf(origin)).toBe(origin)
  })

  it.each([
    'https://192.168.68.54:3000', // not http
    'http://10.0.0.5:3000', // other private ranges are not allowed
    'http://172.16.0.1:3000',
    'http://8.8.8.8:3000', // a public address
    'http://localhost:3000',
    'http://192.168.300.1:3000', // out of range
    'http://192.168.1.256:3000',
    'http://192.169.1.1:3000',
    'http://192.168.1:3000', // not four numbers
    'http://192.168.1.1.1:3000',
  ])('does not trust %s', (origin) => {
    expect(lanOriginOf(origin)).toBeNull()
  })

  it.each([
    'http://192.168.68.54.evil.example',
    'http://192.168.68.54.evil.example:3000',
    'http://192.168.1.1.evil.com:3000',
    'http://evil.example',
    'http://192.168.68.54:3000@evil.example',
    'http://evil.example@192.168.68.54:3000',
    'http://x192.168.1.1:3000',
    'http://192.168.1.1.:3000', // trailing dot
    'http://192.168.1.1:3000.evil.example',
  ])('does not trust the lookalike %s', (origin) => {
    expect(lanOriginOf(origin)).toBeNull()
  })

  it.each([
    '',
    'null',
    'garbage',
    'http://192.168.1.1:3000/evil', // an origin has no path
    'http://192.168.1.1:3000/',
    'http://192.168.1.1:3000?x=1',
    ' http://192.168.1.1:3000',
    'http://192.168.1.1:3000 ',
    'http://192.168.1.1:3000\n',
    'http://192.168.1.1:99999', // not a port
    null,
    undefined,
  ])('does not trust the non-origin %j', (value) => {
    expect(lanOriginOf(value)).toBeNull()
  })
})

describe('trustedOriginsFor', () => {
  const request = (origin: string | null) =>
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: origin === null ? {} : { origin },
    })

  it('in development, trusts the origin of a request from a home-network address', async () => {
    const trusted = trustedOriginsFor('development')!

    expect(await trusted(request('http://192.168.68.54:3000'))).toEqual([
      'http://192.168.68.54:3000',
    ])
  })

  it('in development, trusts nothing else', async () => {
    const trusted = trustedOriginsFor('development')!

    for (const origin of [
      'http://192.168.68.54.evil.example:3000',
      'http://evil.example',
      'https://192.168.68.54:3000',
      'http://10.0.0.5:3000',
      null,
    ]) {
      expect(await trusted(request(origin))).toEqual([])
    }
    expect(await trusted(undefined)).toEqual([])
  })

  it.each(['production', 'test', undefined, '', 'staging'])(
    'adds nothing when NODE_ENV is %j',
    (nodeEnv) => {
      expect(trustedOriginsFor(nodeEnv)).toBeUndefined()
    },
  )
})
