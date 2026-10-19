import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (value: string) => createHash('sha256').update(value).digest()

// Checks the `Authorization: Bearer <secret>` header of a scheduler call. The
// two sides are hashed first, so the comparison takes the same time whatever
// the lengths and however much of the secret is right. With no secret
// configured nothing passes.
export function isAuthorized(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false
  const match = /^Bearer (.+)$/i.exec(header ?? '')
  if (!match) return false
  return timingSafeEqual(digest(match[1]), digest(secret))
}
