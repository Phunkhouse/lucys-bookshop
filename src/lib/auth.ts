import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { env } from '@/config/env'
import { UnauthorizedError } from '@/server/auth/errors'
import { createAuth } from '@/server/auth/create-auth'
import {
  createRequireAdmin,
  type AdminActor,
} from '@/server/auth/require-admin'
import { db } from '@/server/db/client'

export const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseUrl: env.BETTER_AUTH_URL,
  plugins: [nextCookies()], // keep last
})

const checkAdmin = createRequireAdmin((requestHeaders) =>
  auth.api.getSession({ headers: requestHeaders }),
)

// Call this first in every admin page and server action (spec 6.9). A visitor
// who is not signed in is sent to the login page.
export async function requireAdmin(): Promise<AdminActor> {
  try {
    return await checkAdmin(await headers())
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login')
    throw error
  }
}
