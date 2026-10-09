import { describe, expect, it } from 'vitest'
import { UnauthorizedError } from './errors'
import { createRequireAdmin } from './require-admin'

const headers = new Headers({ cookie: 'better-auth.session_token=abc' })

describe('requireAdmin', () => {
  it('returns an actor for a valid session', async () => {
    const requireAdmin = createRequireAdmin(async () => ({
      user: { id: 'u1', email: 'lucy@example.com' },
    }))

    await expect(requireAdmin(headers)).resolves.toMatchObject({
      userId: 'u1',
      email: 'lucy@example.com',
    })
  })

  it('throws UnauthorizedError when there is no session', async () => {
    const requireAdmin = createRequireAdmin(async () => null)

    await expect(requireAdmin(headers)).rejects.toBeInstanceOf(
      UnauthorizedError,
    )
  })

  it('throws UnauthorizedError when the session has no user', async () => {
    const requireAdmin = createRequireAdmin(async () => ({ user: null }))

    await expect(requireAdmin(headers)).rejects.toBeInstanceOf(
      UnauthorizedError,
    )
  })

  it('denies access when the session lookup itself fails', async () => {
    const failure = new Error('database is down')
    const requireAdmin = createRequireAdmin(async () => {
      throw failure
    })

    const error = await requireAdmin(headers).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UnauthorizedError)
    expect((error as UnauthorizedError).cause).toBe(failure)
  })
})
