import { recordJobRun } from './job-heartbeat'
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
//
// When both steps could run, the time is recorded (mails that failed are only
// counted: the job itself is alive). The admin warns when no run has been
// recorded for a few hours, which is how a scheduler that stopped is noticed.
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
  if (!retried.error && !reminded.error) {
    try {
      await recordJobRun(context.now)
    } catch (error) {
      // A side effect: it must not turn a good run into an error.
      console.error(
        'Recording the hourly job run failed:',
        error instanceof Error ? error.message : 'unknown error',
      )
    }
  }
  return { retried, reminded }
}
