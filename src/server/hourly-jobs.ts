import type { SellerNotifier } from './notifier'
import { notifyUnnotifiedOrders, type NotifyContext } from './notifications'
import { sendReservationReminders } from './reservation-reminders'

// `error` means the step could not even run (the database is down), which is
// different from mails that failed: those are counted and sent again next run.
export type JobStep = { sent: number; failed: number; error?: true }

export type HourlyJobsResult = { retried: JobStep; reminded: JobStep }

async function step(
  name: string,
  run: () => Promise<{ sent: number; failed: number }>,
): Promise<JobStep> {
  try {
    return await run()
  } catch (error) {
    console.error(
      `Hourly job step "${name}" failed:`,
      error instanceof Error ? error.message : 'unknown error',
    )
    return { sent: 0, failed: 0, error: true }
  }
}

// What the scheduler asks for once an hour: announce the orders whose first
// mail failed, then send the reminders. A step that cannot run never stops the
// other one.
export async function runHourlyJobs(
  notifier: SellerNotifier,
  context: NotifyContext,
): Promise<HourlyJobsResult> {
  const retried = await step('retry', () =>
    notifyUnnotifiedOrders(notifier, context),
  )
  const reminded = await step('reminders', () =>
    sendReservationReminders(notifier, context),
  )
  return { retried, reminded }
}
