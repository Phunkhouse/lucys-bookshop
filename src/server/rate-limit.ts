import { sql } from 'drizzle-orm'
import { db } from './db/client'
import { requestLimits } from './db/schema'

export type RateLimitRule = {
  // Attempts allowed per window.
  limit: number
  windowMs: number
}

export type RateLimitResult =
  { allowed: true } | { allowed: false; retryAfterMs: number }

const DAY_MS = 24 * 60 * 60 * 1000

// Counts one attempt for `key` and says whether it is within the rule
// (spec 8: rate-limit checkout). Fixed windows aligned to the clock, kept in
// Postgres because serverless instances share no memory.
//
// One atomic upsert does the counting, so attempts that arrive together are
// counted exactly. Refused attempts count too, which is harmless: the window
// ends and everything starts fresh.
//
// Old windows are removed when a key starts a new one, so the table does not
// grow without bound and no job is needed.
export async function hitRateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date,
): Promise<RateLimitResult> {
  if (!Number.isInteger(rule.limit) || rule.limit < 1) {
    throw new Error('A rate limit allows at least one attempt')
  }
  if (!Number.isInteger(rule.windowMs) || rule.windowMs < 1) {
    throw new Error('A rate limit window must be a positive number of ms')
  }

  const start = Math.floor(now.getTime() / rule.windowMs) * rule.windowMs
  const windowStart = new Date(start)

  const [row] = await db
    .insert(requestLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [requestLimits.key, requestLimits.windowStart],
      set: { count: sql`${requestLimits.count} + 1` },
    })
    .returning({ count: requestLimits.count })

  if (row.count === 1) {
    const keepFrom = new Date(
      now.getTime() - Math.max(DAY_MS, 2 * rule.windowMs),
    )
    await db
      .delete(requestLimits)
      .where(sql`${requestLimits.windowStart} < ${keepFrom}`)
  }

  if (row.count <= rule.limit) return { allowed: true }
  return { allowed: false, retryAfterMs: start + rule.windowMs - now.getTime() }
}
