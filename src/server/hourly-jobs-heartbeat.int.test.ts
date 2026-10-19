import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { settings } from '@/server/db/schema'
import { createOrder, resetDatabase } from '@/server/db/test-helpers'
import { runHourlyJobs } from './hourly-jobs'
import { FakeNotifier } from './test-notifier'

const now = new Date('2026-10-19T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const context = { adminBaseUrl: 'https://shop.example', now }

beforeEach(resetDatabase)
afterEach(() => vi.restoreAllMocks())

async function lastRun() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1))
  return row?.jobsLastRunAt ?? null
}

describe('runHourlyJobs records that it ran', () => {
  it('when there was nothing to do', async () => {
    await runHourlyJobs(new FakeNotifier(), context)

    expect(await lastRun()).toEqual(now)
  })

  // The job being alive is what the warning is about. Mails that did not go out
  // show up as failed counts and are sent again next time.
  it('also when mails failed, because the job itself ran', async () => {
    const notifier = new FakeNotifier()
    notifier.failAll = true
    notifier.failReminders = true
    await createOrder({ createdAt: at(-5 * HOUR), expiresAt: at(5 * HOUR) })

    const result = await runHourlyJobs(notifier, context)

    expect(result.retried.failed).toBe(1)
    expect(await lastRun()).toEqual(now)
  })

  it('not when the retry could not run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('The database is busy')
    })

    const result = await runHourlyJobs(new FakeNotifier(), context)

    expect(result.retried).toMatchObject({ error: true })
    expect(await lastRun()).toBeNull()
  })

  it('not when the reminders could not run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db, 'execute').mockImplementationOnce(() => {
      throw new Error('The database is busy')
    })

    const result = await runHourlyJobs(new FakeNotifier(), context)

    expect(result.reminded).toMatchObject({ error: true })
    expect(await lastRun()).toBeNull()
  })

  it('and keeps the earlier time when a later run fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await runHourlyJobs(new FakeNotifier(), { ...context, now: at(-2 * HOUR) })
    vi.spyOn(db, 'execute').mockImplementationOnce(() => {
      throw new Error('The database is busy')
    })

    await runHourlyJobs(new FakeNotifier(), context)

    expect(await lastRun()).toEqual(at(-2 * HOUR))
  })

  // Recording is a side effect: a failure there must not turn a good run into
  // an error for the scheduler.
  it('still answers normally when recording itself fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db, 'insert').mockImplementation(() => {
      throw new Error('The database is busy')
    })

    const result = await runHourlyJobs(new FakeNotifier(), context)

    expect(result).toEqual({
      retried: { sent: 0, failed: 0 },
      reminded: { sent: 0, failed: 0 },
    })
  })
})
