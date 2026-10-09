import { createAuthClient } from 'better-auth/react'

// Browser side. Sign-in goes through the HTTP endpoint on purpose: calls made
// with auth.api on the server skip the rate limit.
export const authClient = createAuthClient()
