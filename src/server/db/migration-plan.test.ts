import { describe, expect, it } from 'vitest'
import { planMigration } from './migration-plan'

const URL_OK = 'postgres://user:pw@db.example.test:5432/app?sslmode=verify-full'

describe('planMigration: where it runs', () => {
  it.each([
    ['preview', 'preview'],
    ['development', 'development'],
    ['an unset VERCEL_ENV (local, CI)', undefined],
    ['an empty VERCEL_ENV', ''],
    ['something unexpected', 'staging'],
  ])('skips for %s', (_label, VERCEL_ENV) => {
    expect(
      planMigration({ VERCEL_ENV, MIGRATION_DATABASE_URL: URL_OK }),
    ).toEqual({ action: 'skip', reason: 'not_production' })
  })

  it('migrates for a production build, with the address as given', () => {
    expect(
      planMigration({
        VERCEL_ENV: 'production',
        MIGRATION_DATABASE_URL: URL_OK,
      }),
    ).toEqual({ action: 'migrate', connectionString: URL_OK })
  })

  it('migrates for a postgresql:// address too', () => {
    const url = 'postgresql://user:pw@db.example.test/app'

    expect(
      planMigration({ VERCEL_ENV: 'production', MIGRATION_DATABASE_URL: url }),
    ).toEqual({ action: 'migrate', connectionString: url })
  })

  it('ignores whitespace around the address', () => {
    expect(
      planMigration({
        VERCEL_ENV: 'production',
        MIGRATION_DATABASE_URL: `  ${URL_OK}\n`,
      }),
    ).toEqual({ action: 'migrate', connectionString: URL_OK })
  })
})

// A production build without a way to migrate must stop, not ship new code
// onto an old schema.
describe('planMigration: a production build that cannot migrate', () => {
  it.each([undefined, '', '   ', '\n'])(
    'fails and names the setting when it is %j',
    (MIGRATION_DATABASE_URL) => {
      expect(() =>
        planMigration({ VERCEL_ENV: 'production', MIGRATION_DATABASE_URL }),
      ).toThrow(/MIGRATION_DATABASE_URL/)
    },
  )

  it.each([
    'mysql://user:secret-password@db.example.test/app',
    'https://user:secret-password@db.example.test/app',
    'not an address with secret-password in it',
    'db.example.test/app',
  ])('refuses %j and never repeats it in the error', (value) => {
    let message = ''
    try {
      planMigration({ VERCEL_ENV: 'production', MIGRATION_DATABASE_URL: value })
    } catch (error) {
      message = String((error as Error).message)
    }

    expect(message).toMatch(/MIGRATION_DATABASE_URL/)
    expect(message).not.toContain('secret-password')
  })
})

// The way out when the database is down and a code-only fix must still go
// live. Loud, and only the exact value 1.
describe('planMigration: the emergency switch', () => {
  it('skips a production build when SKIP_DEPLOY_MIGRATIONS is 1', () => {
    expect(
      planMigration({
        VERCEL_ENV: 'production',
        MIGRATION_DATABASE_URL: URL_OK,
        SKIP_DEPLOY_MIGRATIONS: '1',
      }),
    ).toEqual({ action: 'skip', reason: 'switch' })
  })

  it('does not even need the address then', () => {
    expect(
      planMigration({ VERCEL_ENV: 'production', SKIP_DEPLOY_MIGRATIONS: '1' }),
    ).toEqual({ action: 'skip', reason: 'switch' })
  })

  it.each(['0', 'true', 'yes', ' 1', '1 ', '', '11'])(
    'does not skip for the value %j',
    (SKIP_DEPLOY_MIGRATIONS) => {
      expect(
        planMigration({
          VERCEL_ENV: 'production',
          MIGRATION_DATABASE_URL: URL_OK,
          SKIP_DEPLOY_MIGRATIONS,
        }),
      ).toEqual({ action: 'migrate', connectionString: URL_OK })
    },
  )

  it('is irrelevant outside production, which skips anyway', () => {
    expect(
      planMigration({ VERCEL_ENV: 'preview', SKIP_DEPLOY_MIGRATIONS: '1' }),
    ).toEqual({ action: 'skip', reason: 'not_production' })
  })
})
