import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { requestLimits } from '@/server/db/schema'
import { resetDatabase } from '@/server/db/test-helpers'
import { hitRateLimit } from './rate-limit'

const now = new Date('2026-10-18T12:00:30.000Z')
const MINUTE = 60 * 1000
const rule = { limit: 3, windowMs: 10 * MINUTE }

beforeEach(resetDatabase)

describe('hitRateLimit', () => {
  it('allows the limit and refuses the next attempt', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await hitRateLimit('checkout:a', rule, now)).allowed).toBe(true)
    }
    const refused = await hitRateLimit('checkout:a', rule, now)
    expect(refused.allowed).toBe(false)
    expect(await hitRateLimit('checkout:a', rule, now)).toMatchObject({
      allowed: false,
    })
  })

  it('tells how long until the window ends', async () => {
    for (let i = 0; i < 3; i++) await hitRateLimit('checkout:a', rule, now)
    const refused = await hitRateLimit('checkout:a', rule, now)
    // The window is 12:00:00 to 12:10:00 and it is 12:00:30.
    expect(refused).toEqual({ allowed: false, retryAfterMs: 9.5 * MINUTE })
  })

  it('counts every key on its own', async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit('checkout:a', rule, now)
    expect((await hitRateLimit('checkout:b', rule, now)).allowed).toBe(true)
    expect((await hitRateLimit('login:a', rule, now)).allowed).toBe(true)
  })

  it('starts fresh in the next window', async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit('checkout:a', rule, now)
    const later = new Date(now.getTime() + 10 * MINUTE)
    expect((await hitRateLimit('checkout:a', rule, later)).allowed).toBe(true)
  })

  it('is exact when attempts arrive together', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => hitRateLimit('checkout:a', rule, now)),
    )
    expect(results.filter((r) => r.allowed)).toHaveLength(3)
    expect(results.filter((r) => !r.allowed)).toHaveLength(9)
  })

  it('stores nothing but the key, the window and a count', async () => {
    await hitRateLimit('checkout:abc123', rule, now)
    const rows = await db.select().from(requestLimits)
    expect(rows).toEqual([
      {
        key: 'checkout:abc123',
        windowStart: new Date('2026-10-18T12:00:00.000Z'),
        count: 1,
      },
    ])
  })

  it('clears windows older than a day when a new one starts', async () => {
    const old = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    await hitRateLimit('checkout:old', rule, old)
    await hitRateLimit(
      'checkout:recent',
      rule,
      new Date(now.getTime() - MINUTE * 11),
    )

    await hitRateLimit('checkout:new', rule, now)

    const keys = (await db.select().from(requestLimits)).map((r) => r.key)
    expect(keys.sort()).toEqual(['checkout:new', 'checkout:recent'])
  })

  it('does not clean up on an attempt in an existing window', async () => {
    const old = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    await hitRateLimit('checkout:a', rule, now)
    await db.insert(requestLimits).values({
      key: 'checkout:old',
      windowStart: old,
      count: 1,
    })
    await hitRateLimit('checkout:a', rule, now)
    const rows = await db
      .select()
      .from(requestLimits)
      .where(eq(requestLimits.key, 'checkout:old'))
    expect(rows).toHaveLength(1)
  })

  it('rejects a rule that makes no sense', async () => {
    await expect(
      hitRateLimit('checkout:a', { limit: 0, windowMs: MINUTE }, now),
    ).rejects.toThrow()
    await expect(
      hitRateLimit('checkout:a', { limit: 3, windowMs: 0 }, now),
    ).rejects.toThrow()
  })
})
