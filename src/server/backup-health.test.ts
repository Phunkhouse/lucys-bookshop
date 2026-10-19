import { describe, expect, it } from 'vitest'
import { BACKUP_STALE_AFTER_MS, backupHealth } from './backup-health'

const now = new Date('2026-10-20T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(now.getTime() - ms)

describe('backupHealth', () => {
  it('warns after 36 hours, which is a day and a half', () => {
    expect(BACKUP_STALE_AFTER_MS).toBe(36 * HOUR)
  })

  it('is fine for a backup from this morning and from yesterday', () => {
    expect(backupHealth(ago(2 * HOUR), now)).toEqual({ status: 'ok' })
    expect(backupHealth(ago(26 * HOUR), now)).toEqual({ status: 'ok' })
  })

  it('tolerates one missed night: the next run is 24 hours after the last', () => {
    expect(backupHealth(ago(35 * HOUR), now)).toEqual({ status: 'ok' })
  })

  it('is still fine at exactly 36 hours, and stale a moment later', () => {
    expect(backupHealth(ago(36 * HOUR), now)).toEqual({ status: 'ok' })
    const last = ago(36 * HOUR + 1)
    expect(backupHealth(last, now)).toEqual({
      status: 'stale',
      lastRunAt: last,
    })
  })

  it('says never when no backup was ever reported', () => {
    expect(backupHealth(null, now)).toEqual({ status: 'never' })
  })

  it('is fine when the last backup seems to lie in the future', () => {
    expect(backupHealth(new Date(now.getTime() + HOUR), now)).toEqual({
      status: 'ok',
    })
  })
})
