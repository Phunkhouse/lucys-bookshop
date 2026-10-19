import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { E2E_ADMIN_PASSWORD_ENV } from './admin-account'

// The seed's dates are relative to the moment it runs (reservations, sales within
// 14 days). Re-seeding before every run keeps the expected pages true, however
// old the local database is. The seed refuses non-local databases.
export default function globalSetup() {
  // No real mail from the tests, whatever the developer's .env holds: an empty
  // key means "only log". The scripts below and the server inherit it.
  process.env.RESEND_API_KEY = ''

  // Before the seed: it clears the e2e buyer's orders, and the seed then makes
  // their books available again.
  execSync('pnpm exec tsx scripts/reset-e2e-checkout.ts', { stdio: 'inherit' })
  execSync('pnpm db:seed', { stdio: 'inherit' })

  // A throwaway admin for the admin flows. The password is made fresh for every
  // run and handed to the tests through the environment, so no password lives in
  // the repo. The script refuses non-local databases.
  const password = randomBytes(18).toString('base64url')
  execSync('pnpm exec tsx scripts/create-e2e-admin.ts', {
    stdio: 'inherit',
    env: { ...process.env, E2E_ADMIN_PASSWORD: password },
  })
  process.env[E2E_ADMIN_PASSWORD_ENV] = password
}
