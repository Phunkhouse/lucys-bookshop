import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { db } from '@/server/db/client'
import { settings } from '@/server/db/schema'
import { resetDatabase } from '@/server/db/test-helpers'
import { getJobHealth, recordJobRun } from './job-heartbeat'

const now = new Date('2026-10-19T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)
afterEach(() => vi.restoreAllMocks())

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

  // Without JOBS_SECRET the endpoint is off (development, previews): no
  // scheduler is expected, so there is nothing to warn about and nothing to read.
  it('says ok without reading anything when the job is not enabled', async () => {
    const actor = await testActor()
    await recordJobRun(at(-50 * HOUR))
    const select = vi.spyOn(db, 'select')

    const health = await getJobHealth(actor, now, { enabled: false })

    expect(health).toEqual({ status: 'ok' })
    expect(select).not.toHaveBeenCalled()
  })

  it('warns when the job is enabled, which is the default', async () => {
    const actor = await testActor()

    expect(await getJobHealth(actor, now, { enabled: true })).toEqual({
      status: 'never',
    })
  })

  // A side notice must not take an admin page down: if the read fails (the
  // migration was forgotten, the database hiccups), the page shows no notice
  // and the error goes to the log.
  it('says ok and logs when the read fails', async () => {
    const actor = await testActor()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('column "jobs_last_run_at" does not exist')
    })

    const health = await getJobHealth(actor, now)

    expect(health).toEqual({ status: 'ok' })
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('reads only the one column it needs', async () => {
    const actor = await testActor()
    await db.insert(settings).values({
      id: 1,
      pickupInstructions: 'Dlouhá 5',
      jobsLastRunAt: at(-HOUR),
    })
    const select = vi.spyOn(db, 'select')

    await getJobHealth(actor, now)

    expect(select).toHaveBeenCalledTimes(1)
    const [fields] = select.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ]
    expect(Object.keys(fields)).toEqual(['jobsLastRunAt'])
  })
})
