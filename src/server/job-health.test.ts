import { describe, expect, it } from 'vitest'
import { JOB_STALE_AFTER_MS, jobHealth } from './job-health'

const now = new Date('2026-10-19T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

describe('jobHealth', () => {
  it('is 3 hours: a missed run or two is no news, three in a row is', () => {
    expect(JOB_STALE_AFTER_MS).toBe(3 * HOUR)
  })

  it('says "never" when the job has not run yet', () => {
    expect(jobHealth(null, now)).toEqual({ status: 'never' })
  })

  it('is fine right after a run and a while after it', () => {
    expect(jobHealth(now, now)).toEqual({ status: 'ok' })
    expect(jobHealth(at(-HOUR), now)).toEqual({ status: 'ok' })
    expect(jobHealth(at(-2 * HOUR - 59 * 60 * 1000), now)).toEqual({
      status: 'ok',
    })
  })

  it('is still fine at exactly 3 hours, and stale one millisecond later', () => {
    expect(jobHealth(at(-3 * HOUR), now)).toEqual({ status: 'ok' })
    expect(jobHealth(at(-3 * HOUR - 1), now)).toEqual({
      status: 'stale',
      lastRunAt: at(-3 * HOUR - 1),
    })
  })

  it('is stale after a long silence, and says since when', () => {
    expect(jobHealth(at(-50 * HOUR), now)).toEqual({
      status: 'stale',
      lastRunAt: at(-50 * HOUR),
    })
  })

  // A clock that is a little ahead of this one must not look like trouble.
  it('is fine for a run that seems to be in the future', () => {
    expect(jobHealth(at(HOUR), now)).toEqual({ status: 'ok' })
  })
})
