import { describe, expect, it } from 'vitest'
import { parseEnv } from './env.schema'

const valid = {
  DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  STORAGE_ENDPOINT: 'https://account123.r2.cloudflarestorage.com',
  STORAGE_BUCKET: 'lucys-bookshop',
  STORAGE_ACCESS_KEY_ID: 'AKIAEXAMPLE',
  STORAGE_SECRET_ACCESS_KEY: 'secret-for-the-test',
  IMAGE_BASE_URL: 'https://pub-abc123.r2.dev',
}

describe('JOBS_SECRET', () => {
  it('is optional: without it the job endpoint is switched off', () => {
    expect(parseEnv(valid).JOBS_SECRET).toBeUndefined()
  })

  it('counts an empty value as not set, as .env.example leaves it', () => {
    expect(parseEnv({ ...valid, JOBS_SECRET: '' }).JOBS_SECRET).toBeUndefined()
  })

  it('accepts 32 characters or more', () => {
    const secret = 'j'.repeat(32)

    expect(parseEnv({ ...valid, JOBS_SECRET: secret }).JOBS_SECRET).toBe(secret)
  })

  it('refuses a short one, without putting it into the error', () => {
    const short = 'too-short-secret-value'

    expect(() => parseEnv({ ...valid, JOBS_SECRET: short })).toThrow(
      /JOBS_SECRET/,
    )
    try {
      parseEnv({ ...valid, JOBS_SECRET: short })
    } catch (error) {
      expect(String(error)).not.toContain(short)
    }
  })

  // A newline or space pasted along with the value in a settings page would
  // otherwise make the secret differ from the scheduler's for good.
  it('ignores whitespace around the value', () => {
    const secret = 'j'.repeat(32)

    expect(
      parseEnv({ ...valid, JOBS_SECRET: `  ${secret}\n` }).JOBS_SECRET,
    ).toBe(secret)
  })

  it('counts a value of only whitespace as not set', () => {
    expect(
      parseEnv({ ...valid, JOBS_SECRET: ' \n ' }).JOBS_SECRET,
    ).toBeUndefined()
  })

  it('measures the length without the whitespace', () => {
    expect(() =>
      parseEnv({ ...valid, JOBS_SECRET: `${'j'.repeat(31)}\n` }),
    ).toThrow(/JOBS_SECRET/)
  })
})
