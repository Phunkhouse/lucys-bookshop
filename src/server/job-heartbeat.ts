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

// For the admin pages.
export async function getJobHealth(
  _actor: AdminActor,
  now: Date,
): Promise<JobHealth> {
  const [row] = await db.select().from(settings)
  return jobHealth(row?.jobsLastRunAt ?? null, now)
}
