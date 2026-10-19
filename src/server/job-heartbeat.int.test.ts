import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { db } from '@/server/db/client'
import { settings } from '@/server/db/schema'
import { resetDatabase } from '@/server/db/test-helpers'
import { getJobHealth, recordJobRun } from './job-heartbeat'

const now = new Date('2026-10-19T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)

async function row() {
  const [found] = await db.select().from(settings).where(eq(settings.id, 1))
  return found
}

describe('recordJobRun', () => {
  it('creates the settings row when there is none, with the usual defaults', async () => {
    await recordJobRun(now)

    expect(await row()).toMatchObject({
      id: 1,
      jobsLastRunAt: now,
      zasilkovnaPriceMinor: null,
      pickupInstructions: '',
    })
  })

  it('only changes the time on a row the seller has filled in', async () => {
    const saved = new Date('2026-10-01T08:00:00.000Z')
    await db.insert(settings).values({
      id: 1,
      zasilkovnaPriceMinor: 8900,
      pickupInstructions: 'Dlouhá 5, po domluvě',
      updatedAt: saved,
    })

    await recordJobRun(now)

    expect(await row()).toMatchObject({
      zasilkovnaPriceMinor: 8900,
      pickupInstructions: 'Dlouhá 5, po domluvě',
      updatedAt: saved,
      jobsLastRunAt: now,
    })
  })

  it('moves the time forward on every run, and keeps one row', async () => {
    await recordJobRun(at(-2 * HOUR))
    await recordJobRun(now)

    expect((await row()).jobsLastRunAt).toEqual(now)
    expect(await db.select().from(settings)).toHaveLength(1)
  })

  it('is safe when two runs record at the same moment', async () => {
    await Promise.all([recordJobRun(now), recordJobRun(now), recordJobRun(now)])

    expect(await db.select().from(settings)).toHaveLength(1)
    expect((await row()).jobsLastRunAt).toEqual(now)
  })
})

describe('getJobHealth', () => {
  it('says "never" with no row, and with a row that has no run yet', async () => {
    const actor = await testActor()
    expect(await getJobHealth(actor, now)).toEqual({ status: 'never' })

    await db.insert(settings).values({ id: 1 })
    expect(await getJobHealth(actor, now)).toEqual({ status: 'never' })
  })

  it('says ok after a recent run', async () => {
    const actor = await testActor()
    await recordJobRun(at(-HOUR))

    expect(await getJobHealth(actor, now)).toEqual({ status: 'ok' })
  })

  it('says stale, with the time of the last run, after a long silence', async () => {
    const actor = await testActor()
    await recordJobRun(at(-5 * HOUR))

    expect(await getJobHealth(actor, now)).toEqual({
      status: 'stale',
      lastRunAt: at(-5 * HOUR),
    })
  })
})
