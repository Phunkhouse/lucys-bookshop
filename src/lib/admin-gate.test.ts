import { describe, expect, it } from 'vitest'
import { resolveAdminRedirect, safeNextPath } from './admin-gate'

// The gate is a convenience redirect, not authorization: a cookie can be forged.
// Real checks are requireAdmin() in every admin page and action.

describe('resolveAdminRedirect', () => {
  it('sends a visitor without a session cookie from /admin to the login page', () => {
    expect(
      resolveAdminRedirect({
        pathname: '/admin',
        search: '',
        hasSessionCookie: false,
      }),
    ).toBe('/login?next=%2Fadmin')
  })

  it('remembers the page and query the visitor wanted', () => {
    expect(
      resolveAdminRedirect({
        pathname: '/admin/books',
        search: '?status=hidden',
        hasSessionCookie: false,
      }),
    ).toBe('/login?next=%2Fadmin%2Fbooks%3Fstatus%3Dhidden')
  })

  it('lets a request with a session cookie through (not an authorization decision)', () => {
    expect(
      resolveAdminRedirect({
        pathname: '/admin/books',
        search: '',
        hasSessionCookie: true,
      }),
    ).toBeNull()
  })

  it.each(['/', '/books/abc123/some-title', '/login', '/administrator'])(
    'does not touch public path %s',
    (pathname) => {
      for (const hasSessionCookie of [true, false]) {
        expect(
          resolveAdminRedirect({ pathname, search: '', hasSessionCookie }),
        ).toBeNull()
      }
    },
  )
})

describe('safeNextPath', () => {
  it.each(['/admin', '/admin/books', '/admin/books?status=hidden'])(
    'accepts %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path)
    },
  )

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/books/abc',
    'admin',
    '/administrator',
    '',
    null,
    undefined,
  ])('falls back to /admin for %j', (value) => {
    expect(safeNextPath(value)).toBe('/admin')
  })
})
