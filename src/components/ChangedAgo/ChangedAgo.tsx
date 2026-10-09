import { useLocale, useTranslations } from 'next-intl'
import { formatRelativeTime } from '@/lib/relative-time'

type ChangedAgoProps = {
  date: Date
  now: Date
}

// When a book was last changed. The status is not what this measures: any edit
// moves it (spec 6.9), so the wording says "changed", not "hidden for".
export function ChangedAgo({ date, now }: ChangedAgoProps) {
  const t = useTranslations('Admin.books')
  const locale = useLocale()

  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString(locale)}>
      {t('changed', { when: formatRelativeTime(date, now, locale) })}
    </time>
  )
}
