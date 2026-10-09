// Convenience redirect for visitors who are not signed in. A cookie can be
// forged, so this is not authorization: requireAdmin() is the real check.

const ADMIN_HOME = '/admin'

function isAdminPath(pathname: string) {
  return pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`)
}

export function resolveAdminRedirect(input: {
  pathname: string
  search: string
  hasSessionCookie: boolean
}): string | null {
  if (!isAdminPath(input.pathname) || input.hasSessionCookie) return null
  const next = encodeURIComponent(input.pathname + input.search)
  return `/login?next=${next}`
}

// Only paths inside /admin are accepted, so the login page can't be used to
// bounce a visitor to another site.
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !isAdminPath(value.split('?')[0])) return ADMIN_HOME
  if (/[\\\u0000-\u001f]/.test(value)) return ADMIN_HOME
  return value
}
