import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { formatRelativeTime } from '@/lib/relative-time'
import { SHOP_TIME_ZONE } from '@/lib/shop-time-zone'

type ChangedAgoProps = {
  date: Date
  now: Date
}

// When a book was last changed. The status is not what this measures: any edit
// moves it (spec 6.9), so the wording says "changed", not "hidden for".
export function ChangedAgo({ date, now }: ChangedAgoProps) {
  const t = useTranslations('Admin.books')
  const locale = useLocale()
  const format = useFormatter()

  return (
    <time
      dateTime={date.toISOString()}
      title={format.dateTime(date, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: SHOP_TIME_ZONE,
      })}
    >
      {t('changed', { when: formatRelativeTime(date, now, locale) })}
    </time>
  )
}
