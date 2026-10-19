import { env } from '@/config/env'
import { sellerNotifier } from '@/lib/seller-notifier'
import { runHourlyJobs } from '@/server/hourly-jobs'
import { handleJobsRequest } from '@/server/jobs-endpoint'

// A retry batch can send up to 20 mails one after another.
export const maxDuration = 60

// Called by a scheduler once an hour. Only POST exists, so any other method is
// answered 405 by Next. Protected by the JOBS_SECRET bearer token, not by a login.
export async function POST(request: Request) {
  return handleJobsRequest(request, {
    secret: env.JOBS_SECRET,
    run: () =>
      runHourlyJobs(sellerNotifier, {
        adminBaseUrl: env.BETTER_AUTH_URL,
        now: new Date(),
      }),
  })
}
