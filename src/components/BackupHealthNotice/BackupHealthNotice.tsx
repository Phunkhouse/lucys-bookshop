import { useFormatter, useTranslations } from 'next-intl'
import { SHOP_TIME_ZONE } from '@/lib/shop-time-zone'
import type { JobHealth } from '@/server/job-health'
import css from './BackupHealthNotice.module.scss'

type BackupHealthNoticeProps = {
  health: JobHealth
}

// A warning at the top of the admin pages when the daily backup has stopped
// (ADR 0021). Nothing at all while it is fine.
export function BackupHealthNotice({ health }: BackupHealthNoticeProps) {
  const t = useTranslations('Admin.backupHealth')
  const format = useFormatter()

  if (health.status === 'ok') return null

  return (
    <div className={css.notice}>
      <p className={css.title}>{t('title')}</p>
      <p>
        {health.status === 'never'
          ? t('never')
          : t('stale', {
              when: format.dateTime(health.lastRunAt, {
                dateStyle: 'long',
                timeStyle: 'short',
                timeZone: SHOP_TIME_ZONE,
              }),
            })}
      </p>
      <p>{t('effect')}</p>
    </div>
  )
}
