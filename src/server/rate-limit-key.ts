import { createHmac } from 'node:crypto'

const MIN_SECRET_LENGTH = 32

// The key a rate limit counts under: the scope, then a keyed hash of the
// address. The address itself is personal data and is never stored (spec 8).
// Keyed with a server secret, so the hashes cannot be reversed by trying every
// IPv4 address.
export function rateLimitKey(
  scope: string,
  address: string,
  secret: string,
): string {
  if (address === '') throw new Error('A rate limit needs an address')
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error('The rate limit secret is too short')
  }
  const hash = createHmac('sha256', secret)
    .update(`${scope}:${address}`)
    .digest('hex')
  return `${scope}:${hash}`
}
