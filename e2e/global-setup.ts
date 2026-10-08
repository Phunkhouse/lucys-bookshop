import { execSync } from 'node:child_process'

// The seed's dates are relative to the moment it runs (reservations, sales within
// 14 days). Re-seeding before every run keeps the expected pages true, however
// old the local database is. The seed refuses non-local databases.
export default function globalSetup() {
  execSync('pnpm db:seed', { stdio: 'inherit' })
}
