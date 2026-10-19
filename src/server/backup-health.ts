import { jobHealth, type JobHealth } from './job-health'

// Whether the daily backup is alive (ADR 0021). Pure: no database, no Next.

// The backup runs once a day, so one missed night is normal (a slow GitHub, a
// retry). The warning waits for a day and a half without a reported backup.
export const BACKUP_STALE_AFTER_MS = 36 * 60 * 60 * 1000

// Same shape and rules as the hourly job's health, with its own limit.
export function backupHealth(lastBackupAt: Date | null, now: Date): JobHealth {
  return jobHealth(lastBackupAt, now, BACKUP_STALE_AFTER_MS)
}
