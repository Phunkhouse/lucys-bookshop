import { describe, expect, it } from 'vitest'
import { parseDatabaseEnv, parseEnv } from './env.schema'

const valid = {
  DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
}

describe('parseEnv', () => {
  it('accepts a valid environment', () => {
    expect(parseEnv(valid)).toEqual(valid)
  })

  it('throws when DATABASE_URL is missing', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    )
  })

  it('throws when DATABASE_URL is not a URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'not-a-url' })).toThrow(
      /DATABASE_URL/,
    )
  })

  it('throws when BETTER_AUTH_SECRET is missing', () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: undefined })).toThrow(
      /BETTER_AUTH_SECRET/,
    )
  })

  it('throws when BETTER_AUTH_SECRET is shorter than 32 characters', () => {
    expect(() =>
      parseEnv({ ...valid, BETTER_AUTH_SECRET: 'a'.repeat(31) }),
    ).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('throws when BETTER_AUTH_URL is not a URL', () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_URL: 'localhost' })).toThrow(
      /BETTER_AUTH_URL/,
    )
  })

  it('removes a trailing slash from BETTER_AUTH_URL', () => {
    expect(
      parseEnv({ ...valid, BETTER_AUTH_URL: 'https://shop.example/' })
        .BETTER_AUTH_URL,
    ).toBe('https://shop.example')
  })

  it('falls back to https://$VERCEL_URL when BETTER_AUTH_URL is not set', () => {
    const env = parseEnv({
      ...valid,
      BETTER_AUTH_URL: undefined,
      VERCEL_URL: 'lucys-bookshop-git-feat-abc.vercel.app',
    })

    expect(env.BETTER_AUTH_URL).toBe(
      'https://lucys-bookshop-git-feat-abc.vercel.app',
    )
  })

  it('prefers BETTER_AUTH_URL over VERCEL_URL', () => {
    const env = parseEnv({
      ...valid,
      VERCEL_URL: 'lucys-bookshop-git-feat-abc.vercel.app',
    })

    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3000')
  })

  it('throws when neither BETTER_AUTH_URL nor VERCEL_URL is set', () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_URL: undefined })).toThrow(
      /BETTER_AUTH_URL/,
    )
  })

  it('does not trust a malformed VERCEL_URL', () => {
    expect(() =>
      parseEnv({
        ...valid,
        BETTER_AUTH_URL: undefined,
        VERCEL_URL: 'evil.example/path?x=1',
      }),
    ).toThrow(/BETTER_AUTH_URL/)
  })
})

describe('parseDatabaseEnv', () => {
  it('needs only DATABASE_URL', () => {
    expect(parseDatabaseEnv({ DATABASE_URL: valid.DATABASE_URL })).toEqual({
      DATABASE_URL: valid.DATABASE_URL,
    })
  })

  it('throws when DATABASE_URL is missing', () => {
    expect(() => parseDatabaseEnv({})).toThrow(/DATABASE_URL/)
  })
})
