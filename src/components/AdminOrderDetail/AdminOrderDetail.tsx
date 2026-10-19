import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/Badge'
import { Link } from '@/i18n/navigation'
import { buyerMessageKind, mailtoHref } from '@/lib/buyer-mail'
import { formatRelativeTime } from '@/lib/relative-time'
import { SHOP_TIME_ZONE } from '@/lib/shop-time-zone'
import { useMoney } from '@/lib/use-money'
import type { AdminOrderDetail as OrderData } from '@/server/admin/order-detail'
import css from './AdminOrderDetail.module.scss'

type AdminOrderDetailProps = {
  order: OrderData
  now: Date
  // The buyer's own page for this order, where the payment details are.
  buyerOrderUrl: string
  shopName: string
  // The seller's buttons, shown right under the status so they are in reach.
  children?: React.ReactNode
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

// A phone number for a tel: link: digits and a leading plus, nothing else.
// Null when there is nothing to dial.
const telHref = (phone: string) => {
  const dialable = phone.replace(/[^\d+]/g, '')
  return /\d/.test(dialable) ? `tel:${dialable}` : null
}

// What the seller sees about one order (spec 6.9). Read-only: the buttons that
// change the order come separately. Works the same in a server component and
// a test.
export function AdminOrderDetail({
  order,
  now,
  buyerOrderUrl,
  shopName,
  children,
}: AdminOrderDetailProps) {
  const t = useTranslations('Admin.orders')
  const td = useTranslations('Admin.orders.detail')
  const money = useMoney()
  const format = useFormatter()
  const locale = useLocale()

  const dateTime = (date: Date) =>
    format.dateTime(date, {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: SHOP_TIME_ZONE,
    })
  const phoneHref = telHref(order.phone)
  const waiting = order.stage === 'awaiting_payment'
  const expired = order.stage === 'expired'

  const kind = buyerMessageKind(order.stage)
  const signature = td('mail.signature', { shopName })
  const common = {
    number: order.number,
    name: order.name,
    shopName,
    signature,
  }
  const mailHref =
    kind === 'reminder'
      ? mailtoHref({
          to: order.email,
          subject: td('mail.reminder.subject', common),
          body: td('mail.reminder.body', {
            ...common,
            expired: String(expired),
            deadline: dateTime(order.expiresAt),
            link: buyerOrderUrl,
          }),
        })
      : kind === 'paid'
        ? mailtoHref({
            to: order.email,
            subject: td('mail.paid.subject', common),
            body: td('mail.paid.body', {
              ...common,
              shipping: order.shippingMethod,
            }),
          })
        : kind === 'shipped'
          ? mailtoHref({
              to: order.email,
              subject: td('mail.shipped.subject', common),
              body: td('mail.shipped.body', {
                ...common,
                tracking: order.trackingNumber ?? '',
              }),
            })
          : mailtoHref({ to: order.email })

  return (
    <>
      <h1>{t('number', { number: order.number })}</h1>
      <p className={css.meta}>
        <Badge tone={tone[order.stage]}>{t(`stage.${order.stage}`)}</Badge>
        {order.expiringSoon && (
          <Badge tone="reserved">{t('expiringSoon')}</Badge>
        )}
      </p>
      <p className={css.when}>
        <time
          dateTime={order.createdAt.toISOString()}
          title={dateTime(order.createdAt)}
        >
          {t('placed', {
            when: formatRelativeTime(order.createdAt, now, locale),
          })}
        </time>
      </p>
      {(waiting || expired) && (
        <p>
          {td(waiting ? 'deadline' : 'deadlineExpired', {
            when: dateTime(order.expiresAt),
          })}
        </p>
      )}
      {order.paidAt && <p>{td('paidAt', { when: dateTime(order.paidAt) })}</p>}

      {order.conflicts.length > 0 && (
        <div role="alert" className={css.conflict}>
          <p className={css.conflictTitle}>{td('conflict.title')}</p>
          <p>{td('conflict.text')}</p>
          <ul>
            {order.conflicts.map((book) => (
              <li key={book.id}>
                {book.title} – {td(`conflict.${book.reason}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}

      <section className={css.section} aria-labelledby="order-buyer">
        <h2 id="order-buyer">{td('buyer')}</h2>
        <dl className={css.facts}>
          <dt>{td('name')}</dt>
          <dd>{order.name}</dd>
          <dt>{td('email')}</dt>
          <dd>{order.email}</dd>
          <dt>{td('phone')}</dt>
          <dd>
            {phoneHref ? (
              <a href={phoneHref} className={css.tap}>
                {order.phone}
              </a>
            ) : (
              order.phone
            )}
          </dd>
        </dl>
        <a href={mailHref} className={css.action}>
          {td('writeToBuyer')}
        </a>
      </section>

      <section className={css.section} aria-labelledby="order-delivery">
        <h2 id="order-delivery">{td('delivery')}</h2>
        <dl className={css.facts}>
          <dt>{td('method')}</dt>
          <dd>{t(`shipping.${order.shippingMethod}`)}</dd>
          {order.shippingMethod === 'zasilkovna' && (
            <>
              <dt>{td('pickupPoint')}</dt>
              <dd>{order.shippingDetails || td('notGiven')}</dd>
              {order.trackingNumber && (
                <>
                  <dt>{td('tracking')}</dt>
                  <dd>{order.trackingNumber}</dd>
                </>
              )}
            </>
          )}
          <dt>{td('payment')}</dt>
          <dd>{t(`payment.${order.paymentMethod}`)}</dd>
        </dl>
      </section>

      <section className={css.section} aria-labelledby="order-items">
        <h2 id="order-items">{td('items')}</h2>
        <ul aria-labelledby="order-items" className={css.items}>
          {order.items.map((item) => (
            <li key={item.bookId} className={css.item}>
              <Link
                href={`/admin/books/${item.bookId}/edit`}
                className={css.tap}
              >
                {item.title}
              </Link>
              <span>{money(item.priceMinor, order.currency)}</span>
            </li>
          ))}
        </ul>
        <p className={css.item}>
          <span>{td('shippingCost')}</span>
          <span>
            {order.shippingCostMinor === 0
              ? td('free')
              : money(order.shippingCostMinor, order.currency)}
          </span>
        </p>
        <p className={`${css.item} ${css.total}`}>
          <span>{td('total')}</span>
          <span>{money(order.totalMinor, order.currency)}</span>
        </p>
      </section>
    </>
  )
}
