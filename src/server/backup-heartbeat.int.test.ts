import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { db } from '@/server/db/client'
import { settings } from '@/server/db/schema'
import { resetDatabase } from '@/server/db/test-helpers'
import { getBackupHealth, recordBackupRun } from './backup-heartbeat'
import { recordJobRun } from './job-heartbeat'

const now = new Date('2026-10-20T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)
afterEach(() => vi.restoreAllMocks())

async function row() {
  const [found] = await db.select().from(settings).where(eq(settings.id, 1))
  return found
}

describe('recordBackupRun', () => {
  it('creates the settings row when there is none', async () => {
    await recordBackupRun(now)

    expect(await row()).toMatchObject({
      id: 1,
      backupLastAt: now,
      jobsLastRunAt: null,
    })
  })

  it('only changes its own time on a row the seller has filled in', async () => {
    const saved = new Date('2026-10-01T08:00:00.000Z')
    await db.insert(settings).values({
      id: 1,
      zasilkovnaPriceMinor: 8900,
      pickupInstructions: 'Dlouhá 5, po domluvě',
      updatedAt: saved,
    })

    await recordBackupRun(now)

    expect(await row()).toMatchObject({
      zasilkovnaPriceMinor: 8900,
      pickupInstructions: 'Dlouhá 5, po domluvě',
      updatedAt: saved,
      backupLastAt: now,
    })
  })

  it('does not touch the hourly job time, and the other way round', async () => {
    await recordJobRun(at(-HOUR))
    await recordBackupRun(now)
    expect((await row()).jobsLastRunAt).toEqual(at(-HOUR))

    await recordJobRun(at(HOUR))
    expect((await row()).backupLastAt).toEqual(now)
  })

  it('moves forward on every report and keeps one row', async () => {
    await recordBackupRun(at(-24 * HOUR))
    await recordBackupRun(now)

    expect((await row()).backupLastAt).toEqual(now)
    expect(await db.select().from(settings)).toHaveLength(1)
  })
})

describe('getBackupHealth', () => {
  it('reads nothing and says ok when not enabled', async () => {
    const spy = vi.spyOn(db, 'select')

    const health = await getBackupHealth(await testActor(), now, {
      enabled: false,
    })

    expect(health).toEqual({ status: 'ok' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('says never when enabled and nothing was reported (no row, or an empty one)', async () => {
    expect(await getBackupHealth(await testActor(), now)).toEqual({
      status: 'never',
    })

    await recordJobRun(now)
    expect(await getBackupHealth(await testActor(), now)).toEqual({
      status: 'never',
    })
  })

  it('says ok within 36 hours and stale after', async () => {
    await recordBackupRun(at(-35 * HOUR))
    expect(await getBackupHealth(await testActor(), now)).toEqual({
      status: 'ok',
    })

    await recordBackupRun(at(-37 * HOUR))
    expect(await getBackupHealth(await testActor(), now)).toEqual({
      status: 'stale',
      lastRunAt: at(-37 * HOUR),
    })
  })

  it('never takes the page down: a failed read shows no notice and is logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('relation does not exist')
    })

    expect(await getBackupHealth(await testActor(), now)).toEqual({
      status: 'ok',
    })
    expect(log).toHaveBeenCalled()
  })
})
