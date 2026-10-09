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
