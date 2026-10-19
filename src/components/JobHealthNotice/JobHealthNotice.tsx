import { useFormatter, useTranslations } from 'next-intl'
import { SHOP_TIME_ZONE } from '@/lib/shop-time-zone'
import type { JobHealth } from '@/server/job-health'
import css from './JobHealthNotice.module.scss'

type JobHealthNoticeProps = {
  health: JobHealth
}

// A warning at the top of the admin pages when the hourly job has stopped
// (spec 8). Nothing at all while it is fine.
export function JobHealthNotice({ health }: JobHealthNoticeProps) {
  const t = useTranslations('Admin.jobHealth')
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
