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

const configured = {
  ...valid,
  RESEND_API_KEY: 're_test_key_for_the_test',
  SELLER_NOTIFY_EMAIL: 'seller@example.com',
  NOTIFY_FROM_EMAIL: 'objednavky@example.com',
}

describe('seller notification settings', () => {
  it('are all optional: the shop starts without them and only logs', () => {
    const env = parseEnv(valid)

    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.SELLER_NOTIFY_EMAIL).toBeUndefined()
    expect(env.NOTIFY_FROM_EMAIL).toBeUndefined()
  })

  it('treat an empty value as not set, as .env.example leaves them', () => {
    const env = parseEnv({
      ...valid,
      RESEND_API_KEY: '',
      SELLER_NOTIFY_EMAIL: '',
      NOTIFY_FROM_EMAIL: '',
    })

    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.SELLER_NOTIFY_EMAIL).toBeUndefined()
    expect(env.NOTIFY_FROM_EMAIL).toBeUndefined()
  })

  it('accept a key with a recipient and a sender', () => {
    const env = parseEnv(configured)

    expect(env.RESEND_API_KEY).toBe('re_test_key_for_the_test')
    expect(env.SELLER_NOTIFY_EMAIL).toBe('seller@example.com')
    expect(env.NOTIFY_FROM_EMAIL).toBe('objednavky@example.com')
  })

  it('accept a recipient without a key, for the log-only mode', () => {
    expect(
      parseEnv({ ...valid, SELLER_NOTIFY_EMAIL: 'seller@example.com' })
        .SELLER_NOTIFY_EMAIL,
    ).toBe('seller@example.com')
  })

  // A key without both addresses would start the shop and then fail on the
  // first order, so it is refused at startup instead.
  it.each(['SELLER_NOTIFY_EMAIL', 'NOTIFY_FROM_EMAIL'] as const)(
    'refuse a key without %s',
    (missing) => {
      const source: Record<string, string | undefined> = { ...configured }
      delete source[missing]

      expect(() => parseEnv(source)).toThrow(new RegExp(missing))
    },
  )

  it.each(['SELLER_NOTIFY_EMAIL', 'NOTIFY_FROM_EMAIL'] as const)(
    'refuse an invalid %s',
    (name) => {
      expect(() =>
        parseEnv({ ...configured, [name]: 'not-an-address' }),
      ).toThrow(new RegExp(name))
    },
  )

  it('never put the key into the error message', () => {
    try {
      parseEnv({ ...configured, NOTIFY_FROM_EMAIL: 'nope' })
      expect.unreachable()
    } catch (error) {
      expect(String(error)).not.toContain('re_test_key_for_the_test')
    }
  })
})
