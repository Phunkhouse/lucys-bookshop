const DAY_MS = 24 * 60 * 60 * 1000

// "dnes", "před 5 dny", "před 3 týdny", "před 3 měsíci". Whole 24-hour periods,
// so a change 23 hours ago is still "dnes". A date in the future (clock skew)
// also says "dnes" and never shows a negative value.
export function formatRelativeTime(
  date: Date,
  now: Date,
  locale: string,
): string {
  const days = Math.floor((now.getTime() - date.getTime()) / DAY_MS)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (days < 1) return rtf.format(0, 'day')
  if (days < 7) return rtf.format(-days, 'day')
  if (days < 30) return rtf.format(-Math.floor(days / 7), 'week')
  if (days < 365) return rtf.format(-Math.floor(days / 30), 'month')
  return rtf.format(-Math.floor(days / 365), 'year')
}
