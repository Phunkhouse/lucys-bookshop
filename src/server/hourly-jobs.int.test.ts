import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { createOrder, resetDatabase } from '@/server/db/test-helpers'
import { runHourlyJobs } from './hourly-jobs'
import { FakeNotifier } from './test-notifier'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const context = { adminBaseUrl: 'https://shop.example', now }

beforeEach(resetDatabase)
afterEach(() => vi.restoreAllMocks())

describe('runHourlyJobs', () => {
  it('retries the unannounced orders and sends the reminder, and counts both', async () => {
    const notifier = new FakeNotifier()
    // Never announced, and old enough. Its reservation is far from over.
    const missed = await createOrder({
      createdAt: at(-5 * HOUR),
      expiresAt: at(43 * HOUR),
    })
    // Announced, and ending in 5 hours.
    const ending = await createOrder({
      createdAt: at(-43 * HOUR),
      expiresAt: at(5 * HOUR),
      sellerNotifiedAt: at(-43 * HOUR),
    })

    const result = await runHourlyJobs(notifier, context)

    expect(result).toEqual({
      retried: { sent: 1, failed: 0 },
      reminded: { sent: 1, failed: 0 },
    })
    expect(notifier.orders.map((o) => o.number)).toEqual([missed.number])
    expect(notifier.reminders[0].map((o) => o.number)).toEqual([ending.number])
  })

  it('does nothing, and says so, when nothing is due', async () => {
    const notifier = new FakeNotifier()

    expect(await runHourlyJobs(notifier, context)).toEqual({
      retried: { sent: 0, failed: 0 },
      reminded: { sent: 0, failed: 0 },
    })
  })

  it('counts failed mails without calling it an error', async () => {
    const notifier = new FakeNotifier()
    notifier.failAll = true
    notifier.failReminders = true
    await createOrder({ createdAt: at(-5 * HOUR), expiresAt: at(5 * HOUR) })

    const result = await runHourlyJobs(notifier, context)

    expect(result.retried).toEqual({ sent: 0, failed: 1 })
    expect(result.reminded).toEqual({ sent: 0, failed: 1 })
  })

  it('still sends the reminders when the retry could not run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const notifier = new FakeNotifier()
    const ending = await createOrder({
      createdAt: at(-43 * HOUR),
      expiresAt: at(5 * HOUR),
      sellerNotifiedAt: at(-43 * HOUR),
    })
    // The first query of the run belongs to the retry.
    vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('The database is busy')
    })

    const result = await runHourlyJobs(notifier, context)

    expect(result.retried).toMatchObject({ error: true })
    expect(result.reminded).toEqual({ sent: 1, failed: 0 })
    expect(notifier.reminders[0].map((o) => o.number)).toEqual([ending.number])
  })

  it('still runs the retry when the reminders could not', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const notifier = new FakeNotifier()
    const missed = await createOrder({
      createdAt: at(-5 * HOUR),
      expiresAt: at(43 * HOUR),
    })
    // The retry does not use db.execute; the reminders claim their orders with it.
    vi.spyOn(db, 'execute').mockImplementationOnce(() => {
      throw new Error('The database is busy')
    })

    const result = await runHourlyJobs(notifier, context)

    expect(result.retried).toEqual({ sent: 1, failed: 0 })
    expect(result.reminded).toMatchObject({ error: true })
    expect(notifier.orders.map((o) => o.number)).toEqual([missed.number])
  })
})
