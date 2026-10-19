import { describe, expect, it } from 'vitest'
import { backupObjectKey, isBackupKey, latestBackupKey } from './backup-key'

describe('backupObjectKey', () => {
  it('names the object by UTC day and second', () => {
    expect(backupObjectKey(new Date('2026-10-19T02:17:05.999Z'))).toBe(
      'daily/2026-10-19/lucys-bookshop-20261019T021705Z.dump.age',
    )
  })

  it('uses UTC, not the local time zone', () => {
    // 23:30 UTC is already the next day in Prague.
    expect(backupObjectKey(new Date('2026-12-31T23:30:00Z'))).toBe(
      'daily/2026-12-31/lucys-bookshop-20261231T233000Z.dump.age',
    )
  })

  it('produces a key that isBackupKey accepts', () => {
    expect(isBackupKey(backupObjectKey(new Date('2026-01-02T03:04:05Z')))).toBe(
      true,
    )
  })
})

describe('isBackupKey', () => {
  it('refuses anything that is not a dump under daily/', () => {
    expect(isBackupKey('daily/2026-10-19/notes.txt')).toBe(false)
    expect(
      isBackupKey('other/2026-10-19/lucys-bookshop-20261019T021705Z.dump.age'),
    ).toBe(false)
    expect(isBackupKey('daily/')).toBe(false)
    expect(isBackupKey('')).toBe(false)
  })

  it('refuses a day folder that does not match the file name', () => {
    expect(
      isBackupKey('daily/2026-10-18/lucys-bookshop-20261019T021705Z.dump.age'),
    ).toBe(false)
  })
})

describe('latestBackupKey', () => {
  it('picks the newest dump, whatever the order of the list', () => {
    const keys = [
      'daily/2026-10-18/lucys-bookshop-20261018T021705Z.dump.age',
      'daily/2026-10-20/lucys-bookshop-20261020T021705Z.dump.age',
      'daily/2026-10-19/lucys-bookshop-20261019T021705Z.dump.age',
    ]
    expect(latestBackupKey(keys)).toBe(keys[1])
  })

  it('ignores objects that are not backups', () => {
    expect(
      latestBackupKey([
        'daily/2026-10-20/readme.txt',
        'daily/2026-10-19/lucys-bookshop-20261019T021705Z.dump.age',
      ]),
    ).toBe('daily/2026-10-19/lucys-bookshop-20261019T021705Z.dump.age')
  })

  it('returns null when there is no backup', () => {
    expect(latestBackupKey([])).toBeNull()
    expect(latestBackupKey(['daily/x'])).toBeNull()
  })
})
