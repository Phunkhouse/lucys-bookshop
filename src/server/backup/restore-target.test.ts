import { describe, expect, it } from 'vitest'
import { assertSafeRestoreTarget, forContainer } from './restore-target'

const PROD =
  'postgres://app:pw@ep-cool-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require'
const DEV = 'postgres://bookshop:pw@127.0.0.1:5432/bookshop'

const check = (
  target: string,
  allowRemote = false,
  protectedUrls = [PROD, DEV],
) => assertSafeRestoreTarget(target, { allowRemote, protectedUrls })

describe('assertSafeRestoreTarget', () => {
  it('accepts a new database on this machine', () => {
    expect(() =>
      check('postgres://bookshop:pw@127.0.0.1:5432/restore_check'),
    ).not.toThrow()
    expect(() =>
      check('postgres://bookshop:pw@localhost:5432/restore_check'),
    ).not.toThrow()
    expect(() =>
      check('postgres://bookshop:pw@[::1]:5432/restore_check'),
    ).not.toThrow()
  })

  it('refuses something that is not a database address', () => {
    expect(() => check('')).toThrow()
    expect(() => check('not a url')).toThrow()
    expect(() => check('https://example.com/db')).toThrow()
  })

  it('refuses an address without a database name', () => {
    expect(() => check('postgres://bookshop:pw@127.0.0.1:5432')).toThrow()
    expect(() => check('postgres://bookshop:pw@127.0.0.1:5432/')).toThrow()
  })

  it('refuses a remote server unless it was asked for explicitly', () => {
    const remote =
      'postgres://u:pw@ep-new-456.eu-central-1.aws.neon.tech/neondb'
    expect(() => check(remote)).toThrow(/--allow-remote/)
    expect(() => check(remote, true)).not.toThrow()
  })

  it('refuses the production database even when remote is allowed', () => {
    expect(() => check(PROD, true)).toThrow(/production|protected/i)
  })

  it('sees through the pooler address and other credentials', () => {
    const direct =
      'postgres://other:other@ep-cool-123.eu-central-1.aws.neon.tech/neondb'
    expect(() => check(direct, true)).toThrow()
  })

  it('refuses the local development database itself', () => {
    expect(() => check(DEV)).toThrow()
    expect(() => check('postgres://x:y@localhost:5432/bookshop')).toThrow()
  })

  it('allows another database on the same server as a protected one', () => {
    expect(() =>
      check(
        'postgres://x:y@ep-cool-123.eu-central-1.aws.neon.tech/other',
        true,
      ),
    ).not.toThrow()
  })

  it('ignores protected settings that are empty or not set', () => {
    expect(() =>
      check('postgres://x:y@127.0.0.1:5432/restore_check', false, [
        undefined,
        '',
      ] as unknown as string[]),
    ).not.toThrow()
  })
})

describe('forContainer', () => {
  it('points a local address at the host from inside Docker', () => {
    expect(forContainer('postgres://u:p@127.0.0.1:5432/db')).toBe(
      'postgres://u:p@host.docker.internal:5432/db',
    )
    expect(forContainer('postgres://u:p@localhost:6543/db?x=1')).toBe(
      'postgres://u:p@host.docker.internal:6543/db?x=1',
    )
  })

  it('leaves a remote address alone', () => {
    const url = 'postgres://u:p@ep-x.neon.tech/db?sslmode=require'
    expect(forContainer(url)).toBe(url)
  })
})
