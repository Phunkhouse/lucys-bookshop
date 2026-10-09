import { UnauthorizedError } from './errors'

declare const adminBrand: unique symbol

// Proof that requireAdmin() ran. Admin services take one as their first
// parameter, so code that skipped the check doesn't compile.
export type AdminActor = {
  readonly userId: string
  readonly email: string
  readonly [adminBrand]: true
}

type SessionLookup = (
  headers: Headers,
) => Promise<{ user?: { id: string; email: string } | null } | null>

// Every signed-in user is an admin (ADR 0012), so a valid session is enough.
// Fails closed: if the lookup throws, access is denied.
export function createRequireAdmin(getSession: SessionLookup) {
  return async function requireAdmin(headers: Headers): Promise<AdminActor> {
    let found
    try {
      found = await getSession(headers)
    } catch (cause) {
      throw new UnauthorizedError({ cause })
    }
    if (!found?.user) throw new UnauthorizedError()
    return { userId: found.user.id, email: found.user.email } as AdminActor
  }
}
