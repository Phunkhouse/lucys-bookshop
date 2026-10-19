import { env } from '@/config/env'
import { recordBackupRun } from '@/server/backup-heartbeat'
import { handleBackupReport } from '@/server/backup-report-endpoint'

// Called by the backup workflow after a stored backup. Only POST exists, so any
// other method is answered 405 by Next. Protected by the BACKUP_REPORT_SECRET
// bearer token, not by a login.
export async function POST(request: Request) {
  return handleBackupReport(request, {
    secret: env.BACKUP_REPORT_SECRET,
    record: recordBackupRun,
    now: () => new Date(),
  })
}
