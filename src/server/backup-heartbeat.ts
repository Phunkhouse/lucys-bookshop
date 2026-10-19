import type { AdminActor } from './auth/require-admin'
import { backupHealth } from './backup-health'
import { db } from './db/client'
import { settings } from './db/schema'
import type { JobHealth } from './job-health'

// The backup workflow reports here after a stored and size-checked backup. The
// one settings row (id 1) is created if the seller has not saved settings yet; an
// existing row keeps everything else, including its updatedAt.
export async function recordBackupRun(now: Date): Promise<void> {
  await db
    .insert(settings)
    .values({ id: 1, backupLastAt: now })
    .onConflictDoUpdate({
      target: settings.id,
      set: { backupLastAt: now },
    })
}

// For the admin pages, with the same two rules as getJobHealth:
// - Not enabled (no BACKUP_REPORT_SECRET: development, previews) means no backup
//   is expected, so there is nothing to warn about and nothing is read.
// - A side notice must never take an admin page down: a failed read shows no
//   notice and the error goes to the log.
export async function getBackupHealth(
  _actor: AdminActor,
  now: Date,
  { enabled = true }: { enabled?: boolean } = {},
): Promise<JobHealth> {
  if (!enabled) return { status: 'ok' }
  try {
    const [row] = await db
      .select({ backupLastAt: settings.backupLastAt })
      .from(settings)
    return backupHealth(row?.backupLastAt ?? null, now)
  } catch (error) {
    console.error(
      'Reading the backup status failed:',
      error instanceof Error ? error.message : 'unknown error',
    )
    return { status: 'ok' }
  }
}
