// Testing from a phone: the browser's origin is the dev machine's home-network
// address, for example http://192.168.68.54:3000, which changes from time to
// time. In development only, such an origin is trusted for sign-in.
//
// This is a function and not a wildcard pattern on purpose: Better Auth's `*`
// matches across dots, so a pattern like http://192.168.*:3000 would also trust
// http://192.168.1.1.evil.example:3000. Here the whole origin must be exactly
// http://192.168.<0-255>.<0-255> with an optional port, and nothing else.

const OCTET = '(?:0|[1-9]\\d{0,2})'
const LAN_ORIGIN = new RegExp(
  `^http://192\\.168\\.(${OCTET})\\.(${OCTET})(?::([1-9]\\d{0,4}))?$`,
)

// The origin itself when it is a home-network address, otherwise null.
export function lanOriginOf(value: string | null | undefined): string | null {
  if (!value) return null
  const match = LAN_ORIGIN.exec(value)
  if (!match) return null

  const [, third, fourth, port] = match
  if (Number(third) > 255 || Number(fourth) > 255) return null
  if (port !== undefined && Number(port) > 65535) return null
  return value
}

// For Better Auth's `trustedOrigins`. Only in development: production, Vercel
// previews and tests keep trusting just BETTER_AUTH_URL.
export function trustedOriginsFor(nodeEnv: string | undefined) {
  if (nodeEnv !== 'development') return undefined

  return (request?: Request): string[] => {
    const origin = lanOriginOf(request?.headers.get('origin'))
    return origin ? [origin] : []
  }
}
