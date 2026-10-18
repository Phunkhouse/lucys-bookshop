const MAX_LENGTH = 64

type HeaderReader = { get(name: string): string | null }

// The visitor's address as the host reports it, for rate limiting only.
// Vercel sets x-real-ip and overwrites x-forwarded-for with the real client
// address, so a visitor cannot choose it there. On another host this needs
// checking again (spec 8, portability). Without a usable header the answer is
// "unknown", which all such requests share.
export function clientAddress(headers: HeaderReader): string {
  const candidates = [
    headers.get('x-real-ip'),
    headers.get('x-forwarded-for')?.split(',')[0],
  ]
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value && value.length <= MAX_LENGTH) return value
  }
  return 'unknown'
}
