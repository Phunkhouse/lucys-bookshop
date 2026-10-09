import { createRequireAdmin } from './require-admin'

// An AdminActor can only come from requireAdmin(), so tests get one the same
// way, with a session lookup that always succeeds.
export function testActor() {
  return createRequireAdmin(async () => ({
    user: { id: 'test-admin', email: 'admin@example.com' },
  }))(new Headers())
}
