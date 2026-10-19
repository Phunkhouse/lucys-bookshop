// A random version 4 UUID for the browser (the checkout key, spec 6.5).
//
// crypto.randomUUID() exists only in a secure context (https, or localhost) and
// in Safari from 15.4, so a phone on plain http (`pnpm dev` on a home network) or
// an older iPhone would crash on it. crypto.getRandomValues() has no such limit,
// so it is the fallback. Never Math.random(): an identifier that can be guessed is
// worse than none, so with no secure source at all this fails loudly.
export function randomUuid(): string {
  const secure = globalThis.crypto
  if (typeof secure?.randomUUID === 'function') return secure.randomUUID()
  if (typeof secure?.getRandomValues !== 'function') {
    throw new Error('This browser has no secure random number source')
  }

  const bytes = secure.getRandomValues(new Uint8Array(16))
  // The six bits a UUID fixes: version 4, and the RFC 4122 variant.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
