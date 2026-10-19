// Where a backup lives in the bucket. The workflow (.github/workflows/backup.yml)
// builds the same name in shell; backup-workflow.test.ts pins that the two agree.
// The day folder keeps the bucket readable by hand, the second-precise stamp keeps
// two runs on one day apart, and both sort by time as plain strings.

const PREFIX = 'daily/'
const KEY_PATTERN =
  /^daily\/(\d{4}-\d{2}-\d{2})\/lucys-bookshop-(\d{4})(\d{2})(\d{2})T\d{6}Z\.dump\.age$/

export function backupObjectKey(at: Date): string {
  const iso = at.toISOString() // always UTC
  const day = iso.slice(0, 10)
  const stamp = iso.slice(0, 19).replace(/[-:]/g, '') + 'Z'
  return `${PREFIX}${day}/lucys-bookshop-${stamp}.dump.age`
}

export function isBackupKey(key: string): boolean {
  const match = KEY_PATTERN.exec(key)
  if (!match) return false
  const [, day, year, month, date] = match
  return day === `${year}-${month}-${date}`
}

// The newest backup in a bucket listing, or null when there is none. Anything
// else in the bucket is ignored.
export function latestBackupKey(keys: readonly string[]): string | null {
  const backups = keys.filter(isBackupKey).sort()
  return backups.at(-1) ?? null
}
