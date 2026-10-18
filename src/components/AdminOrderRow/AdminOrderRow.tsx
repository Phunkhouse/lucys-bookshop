import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/Badge'
import { Link } from '@/i18n/navigation'
import { formatRelativeTime } from '@/lib/relative-time'
import type { AdminOrderItem } from '@/server/admin/order-list'
import css from './AdminOrderRow.module.scss'

type AdminOrderRowProps = {
  order: AdminOrderItem
  now: Date
}

const tone = {
  awaiting_payment: 'reserved',
  expired: 'neutral',
  paid: 'sold',
  shipped: 'sold',
  completed: 'sold',
  cancelled: 'neutral',
  refunded: 'neutral',
} as const

export function AdminOrderRow({ order, now }: AdminOrderRowProps) {
  const t = useTranslations('Admin.orders')
  const format = useFormatter()
  const locale = useLocale()

  // Minor units: whole crowns without decimals, anything else with two.
  const fractionDigits = order.totalMinor % 100 === 0 ? 0 : 2
  const total = format.number(order.totalMinor / 100, {
    style: 'currency',
    currency: order.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  return (
    <article className={css.row}>
      <h2 className={css.title}>
        <Link href={`/admin/orders/${order.number}`} className={css.link}>
          {t('number', { number: order.number })}
        </Link>
      </h2>
      <p>{order.name}</p>
      <p className={css.total}>{total}</p>
      <p className={css.meta}>
        <Badge tone={tone[order.stage]}>{t(`stage.${order.stage}`)}</Badge>
        {order.expiringSoon && (
          <Badge tone="reserved">{t('expiringSoon')}</Badge>
        )}
      </p>
      <p className={css.details}>
        {t(`payment.${order.paymentMethod}`)} ·{' '}
        {t(`shipping.${order.shippingMethod}`)} ·{' '}
        {t('books', { count: order.bookCount })}
      </p>
      <p className={css.placed}>
        <time
          dateTime={order.createdAt.toISOString()}
          title={order.createdAt.toLocaleString(locale)}
        >
          {t('placed', {
            when: formatRelativeTime(order.createdAt, now, locale),
          })}
        </time>
      </p>
    </article>
  )
}
