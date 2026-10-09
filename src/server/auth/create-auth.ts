import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import type { BetterAuthPlugin } from 'better-auth'
import * as schema from '@/server/db/schema'

export const MIN_PASSWORD_LENGTH = 12

type Database = Parameters<typeof drizzleAdapter>[0]

type CreateAuthOptions = {
  db: Database
  secret: string
  baseUrl: string
  // The app adds plugins that need Next (cookie handling); this file stays free of it.
  plugins?: BetterAuthPlugin[]
}

// Email and password only. Sign-up is off: accounts are created by
// scripts/create-admin.ts (ADR 0012). Rate-limit counters live in the database
// because serverless instances don't share memory.
export function createAuth({
  db,
  secret,
  baseUrl,
  plugins,
}: CreateAuthOptions) {
  return betterAuth({
    baseURL: baseUrl,
    secret,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      customRules: {
        // 5 attempts per address per 15 minutes
        '/sign-in/email': { window: 15 * 60, max: 5 },
      },
    },
    plugins,
  })
}
