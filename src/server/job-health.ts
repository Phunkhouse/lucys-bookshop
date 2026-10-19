// Whether the hourly job is alive (spec 8). Pure: no database, no Next.

// The job runs every hour. A missed run or two is nothing, so the warning waits
// for three hours without a successful run.
export const JOB_STALE_AFTER_MS = 3 * 60 * 60 * 1000

export type JobHealth =
  | { status: 'ok' }
  // The job has never recorded a run: not set up yet.
  | { status: 'never' }
  | { status: 'stale'; lastRunAt: Date }

// At exactly the limit it is still fine. A run that seems to lie in the future
// (a clock a little ahead) is fine too.
export function jobHealth(lastRunAt: Date | null, now: Date): JobHealth {
  if (lastRunAt === null) return { status: 'never' }
  if (now.getTime() - lastRunAt.getTime() > JOB_STALE_AFTER_MS) {
    return { status: 'stale', lastRunAt }
  }
  return { status: 'ok' }
}
