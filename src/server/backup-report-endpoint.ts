import { isAuthorized } from './job-auth'

export type BackupReportDeps = {
  // The configured secret, or undefined when the endpoint is switched off.
  secret: string | undefined
  record: (now: Date) => Promise<void>
  now: () => Date
}

const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init.headers },
  })

// What the backup workflow calls after a finished backup (ADR 0021). Web Request
// in, Response out, so it is tested without Next. The time is the server's own:
// the caller cannot backdate a backup or claim one that did not happen at that
// moment. The body, if any, is ignored.
export async function handleBackupReport(
  request: Request,
  { secret, record, now }: BackupReportDeps,
): Promise<Response> {
  if (!secret) return json({ error: 'not_configured' }, { status: 503 })
  if (!isAuthorized(request.headers.get('authorization'), secret)) {
    return json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
    )
  }

  try {
    await record(now())
  } catch (error) {
    console.error(
      'Recording the backup failed:',
      error instanceof Error ? error.message : 'unknown error',
    )
    return json({ error: 'record_failed' }, { status: 500 })
  }
  return json({ ok: true })
}
