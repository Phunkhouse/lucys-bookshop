import 'dotenv/config' // must stay first: loads .env before anything reads the env
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { E2E_ADMIN_EMAIL } from '../e2e/admin-account'
import { env } from '../src/config/env'
import { createAdmin } from '../src/server/auth/create-admin'
import { createAuth } from '../src/server/auth/create-auth'
import { db, pool } from '../src/server/db/client'
import { user } from '../src/server/db/schema'

// Used by the e2e global setup only. Creates the throwaway admin for the browser
// tests with the password from E2E_ADMIN_PASSWORD, replacing the one from an
// earlier run. Refuses anything but a local database.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

async function main() {
  const { hostname } = new URL(env.DATABASE_URL)
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(
      `Refusing to create the e2e admin on ${hostname}: only a local database is allowed.`,
    )
  }
  const password = process.env.E2E_ADMIN_PASSWORD
  if (!password) throw new Error('E2E_ADMIN_PASSWORD is not set.')

  // Deleting the user removes its accounts and sessions with it.
  await db.delete(user).where(eq(user.email, E2E_ADMIN_EMAIL))

  const auth = createAuth({
    db,
    secret: randomBytes(32).toString('base64'),
    baseUrl: 'http://localhost:3000',
  })
  await createAdmin(auth, {
    name: 'E2E Admin',
    email: E2E_ADMIN_EMAIL,
    password,
  })
  console.log(`Created e2e admin ${E2E_ADMIN_EMAIL}`)
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof z.ZodError
        ? z.prettifyError(error)
        : error instanceof Error
          ? error.message
          : error,
    )
    process.exitCode = 1
  })
  .finally(() => pool.end())
