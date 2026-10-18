import { readFileSync, readdirSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './client'
import { orderCounters, settings } from './schema'
import { createOrder, resetDatabase } from './test-helpers'

beforeEach(resetDatabase)

// The constraints are the last line of defence behind the services, so they
// get their own tests.
async function rejects(run: Promise<unknown>) {
  await expect(run).rejects.toThrow()
}

describe('orders.checkoutKey', () => {
  it('is unique, but many rows may have none', async () => {
    await createOrder({ checkoutKey: 'key-1' })
    await rejects(createOrder({ checkoutKey: 'key-1' }))
    await createOrder()
    await createOrder()
  })
})

describe('order_counters', () => {
  it('allows 0 to 9999 and refuses more', async () => {
    await db.insert(orderCounters).values({ year: 2026, last: 9999 })
    await rejects(db.insert(orderCounters).values({ year: 2027, last: 10000 }))
  })

  it('counts up with one atomic upsert', async () => {
    const next = async () => {
      const rows = await db
        .insert(orderCounters)
        .values({ year: 2026, last: 1 })
        .onConflictDoUpdate({
          target: orderCounters.year,
          set: { last: sql`${orderCounters.last} + 1` },
        })
        .returning({ last: orderCounters.last })
      return rows[0].last
    }
    expect(await next()).toBe(1)
    expect(await next()).toBe(2)
  })
})

describe('the order counter backfill migration', () => {
  // Runs the real migration file against orders that already exist.
  const dir = readdirSync('drizzle').find((name) =>
    name.endsWith('_seed_order_counters'),
  )
  const backfill = readFileSync(`drizzle/${dir}/migration.sql`, 'utf8')

  it('starts every year at its highest used sequence', async () => {
    await createOrder({ number: 20260001 })
    await createOrder({ number: 20260007 })
    await createOrder({ number: 20250123 })
    await createOrder({ number: 42 }) // not in the YYYYNNNN shape: ignored

    await db.execute(sql.raw(backfill))

    const rows = await db.select().from(orderCounters)
    expect(
      rows.map((r) => [r.year, r.last]).sort((a, b) => a[0] - b[0]),
    ).toEqual([
      [2025, 123],
      [2026, 7],
    ])
  })

  it('does nothing without orders, and never lowers a counter', async () => {
    await db.execute(sql.raw(backfill))
    expect(await db.select().from(orderCounters)).toEqual([])

    await db.insert(orderCounters).values({ year: 2026, last: 50 })
    await createOrder({ number: 20260003 })
    await db.execute(sql.raw(backfill))
    const [row] = await db.select().from(orderCounters)
    expect(row.last).toBe(50)
  })
})

describe('settings', () => {
  it('holds one row only', async () => {
    await db.insert(settings).values({})
    await rejects(db.insert(settings).values({ id: 2 }))
    await rejects(db.insert(settings).values({}))
  })

  it('has no price until the seller sets one, and never a negative one', async () => {
    const [row] = await db.insert(settings).values({}).returning()
    expect(row.zasilkovnaPriceMinor).toBeNull()
    expect(row.pickupInstructions).toBe('')
    await rejects(db.update(settings).set({ zasilkovnaPriceMinor: -1 }))
  })
})
