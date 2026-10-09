import { getSessionCookie } from 'better-auth/cookies'
import createMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { routing } from './i18n/routing'
import { resolveAdminRedirect } from './lib/admin-gate'

const handleIntl = createMiddleware(routing)

// The redirect for visitors without a session cookie is a convenience only.
// Every admin page and action checks the session itself (requireAdmin).
export default function proxy(request: NextRequest) {
  const redirectTo = resolveAdminRedirect({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasSessionCookie: Boolean(getSessionCookie(request)),
  })
  if (redirectTo) return NextResponse.redirect(new URL(redirectTo, request.url))
  return handleIntl(request)
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
}
