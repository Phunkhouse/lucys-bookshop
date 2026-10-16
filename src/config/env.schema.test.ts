import { describe, expect, it } from 'vitest'
import { parseDatabaseEnv, parseEnv } from './env.schema'

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

describe('parseEnv', () => {
  it('accepts a valid environment, with the storage defaults filled in', () => {
    expect(parseEnv(valid)).toEqual({
      ...valid,
      STORAGE_REGION: 'auto',
      STORAGE_FORCE_PATH_STYLE: false,
    })
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

describe('parseEnv: object storage', () => {
  it.each([
    'STORAGE_ENDPOINT',
    'STORAGE_BUCKET',
    'STORAGE_ACCESS_KEY_ID',
    'STORAGE_SECRET_ACCESS_KEY',
    'IMAGE_BASE_URL',
  ])('throws when %s is missing', (name) => {
    expect(() => parseEnv({ ...valid, [name]: undefined })).toThrow(
      new RegExp(name),
    )
  })

  it.each([
    'STORAGE_BUCKET',
    'STORAGE_ACCESS_KEY_ID',
    'STORAGE_SECRET_ACCESS_KEY',
  ])('throws when %s is empty', (name) => {
    expect(() => parseEnv({ ...valid, [name]: '' })).toThrow(new RegExp(name))
  })

  it('throws when STORAGE_ENDPOINT is not a URL', () => {
    expect(() => parseEnv({ ...valid, STORAGE_ENDPOINT: 'r2' })).toThrow(
      /STORAGE_ENDPOINT/,
    )
  })

  it('reads the region and the path-style switch (MinIO needs path style)', () => {
    const env = parseEnv({
      ...valid,
      STORAGE_REGION: 'eu-west-1',
      STORAGE_FORCE_PATH_STYLE: 'true',
    })

    expect(env).toMatchObject({
      STORAGE_REGION: 'eu-west-1',
      STORAGE_FORCE_PATH_STYLE: true,
    })
    expect(
      parseEnv({ ...valid, STORAGE_FORCE_PATH_STYLE: 'false' })
        .STORAGE_FORCE_PATH_STYLE,
    ).toBe(false)
  })

  it('throws when STORAGE_FORCE_PATH_STYLE is neither true nor false', () => {
    expect(() =>
      parseEnv({ ...valid, STORAGE_FORCE_PATH_STYLE: 'maybe' }),
    ).toThrow(/STORAGE_FORCE_PATH_STYLE/)
  })

  // Photos are read from IMAGE_BASE_URL: a public address today (r2.dev), a
  // custom domain later, or a path on the app itself if images are served by it.
  it.each([
    ['https://pub-abc123.r2.dev', 'https://pub-abc123.r2.dev'],
    ['https://pub-abc123.r2.dev/', 'https://pub-abc123.r2.dev'],
    ['https://images.example.com/shop/', 'https://images.example.com/shop'],
    ['http://127.0.0.1:9000/bookshop', 'http://127.0.0.1:9000/bookshop'],
    ['/images', '/images'],
    ['/images/', '/images'],
  ])('accepts IMAGE_BASE_URL %s as %s', (given, expected) => {
    expect(parseEnv({ ...valid, IMAGE_BASE_URL: given }).IMAGE_BASE_URL).toBe(
      expected,
    )
  })

  it.each([
    '',
    'images',
    'ftp://example.com',
    'javascript:alert(1)',
    '//evil.example',
  ])('throws for IMAGE_BASE_URL %j', (given) => {
    expect(() => parseEnv({ ...valid, IMAGE_BASE_URL: given })).toThrow(
      /IMAGE_BASE_URL/,
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
