import { describe, expect, it } from 'vitest'
import { parseEnv } from './env.schema'

describe('parseEnv', () => {
  it('accepts a valid DATABASE_URL', () => {
    const url = 'postgres://user:pass@127.0.0.1:5432/db'
    expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url)
  })

  it('throws when DATABASE_URL is missing', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/)
  })

  it('throws when DATABASE_URL is not a URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'not-a-url' })).toThrow(
      /DATABASE_URL/,
    )
  })
})
