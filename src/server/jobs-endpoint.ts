import type { HourlyJobsResult } from './hourly-jobs'
import { isAuthorized } from './job-auth'

export type JobsEndpointDeps = {
  // The configured secret, or undefined when the endpoint is switched off.
  secret: string | undefined
  run: () => Promise<HourlyJobsResult>
}

const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init.headers },
  })

// What the scheduler calls once an hour (spec 8). Web Request in, Response out,
// so it is tested without Next. It answers with counts only: no names, no
// addresses, nothing about the secret or the database.
export async function handleJobsRequest(
  request: Request,
  { secret, run }: JobsEndpointDeps,
): Promise<Response> {
  if (!secret) return json({ error: 'not_configured' }, { status: 503 })
  if (!isAuthorized(request.headers.get('authorization'), secret)) {
    return json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
    )
  }

  let result: HourlyJobsResult
  try {
    result = await run()
  } catch (error) {
    console.error(
      'Hourly job failed:',
      error instanceof Error ? error.message : 'unknown error',
    )
    return json({ error: 'job_failed' }, { status: 500 })
  }

  // A step that could not run is a failure the caller should see.
  if (result.retried.error || result.reminded.error) {
    return json({ error: 'job_failed' }, { status: 500 })
  }
  return json({
    retried: { sent: result.retried.sent, failed: result.retried.failed },
    reminded: { sent: result.reminded.sent, failed: result.reminded.failed },
  })
}
