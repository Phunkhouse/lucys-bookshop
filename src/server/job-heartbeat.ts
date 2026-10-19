import type { AdminActor } from './auth/require-admin'
import { db } from './db/client'
import { settings } from './db/schema'
import { jobHealth, type JobHealth } from './job-health'

// The hourly job calls this when it ran without a step failing. The one
// settings row (id 1) is created if the seller has not saved settings yet; an
// existing row keeps everything else, including its updatedAt.
export async function recordJobRun(now: Date): Promise<void> {
  await db
    .insert(settings)
    .values({ id: 1, jobsLastRunAt: now })
    .onConflictDoUpdate({
      target: settings.id,
      set: { jobsLastRunAt: now },
    })
}

// For the admin pages. Two rules live here, so the pages stay simple:
// - Not enabled (no JOBS_SECRET: development, previews) means no scheduler is
//   expected, so there is nothing to warn about and nothing is read.
// - A side notice must never take an admin page down: if the read fails (the
//   migration was forgotten, the database hiccups), the page shows no notice
//   and the error goes to the log.
export async function getJobHealth(
  _actor: AdminActor,
  now: Date,
  { enabled = true }: { enabled?: boolean } = {},
): Promise<JobHealth> {
  if (!enabled) return { status: 'ok' }
  try {
    const [row] = await db
      .select({ jobsLastRunAt: settings.jobsLastRunAt })
      .from(settings)
    return jobHealth(row?.jobsLastRunAt ?? null, now)
  } catch (error) {
    console.error(
      'Reading the hourly job status failed:',
      error instanceof Error ? error.message : 'unknown error',
    )
    return { status: 'ok' }
  }
}
