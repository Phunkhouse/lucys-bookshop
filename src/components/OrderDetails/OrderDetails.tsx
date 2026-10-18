import { useFormatter, useTranslations } from 'next-intl'
import { QrCode } from '@/components/QrCode'
import { useMoney } from '@/lib/use-money'
import type { OrderStage, OrderView } from '@/server/order-view'
import type { PaymentInstructions } from '@/server/payment-instructions'
import css from './OrderDetails.module.scss'

type OrderDetailsProps = {
  order: OrderView
  // Null unless the order is a bank transfer that is still waiting for money.
  payment: PaymentInstructions | null
  pickupInstructions: string
}

// The shop's clock, not the visitor's.
const SHOP_TIME_ZONE = 'Europe/Prague'

const groupIban = (iban: string) => iban.replace(/(.{4})(?=.)/g, '$1 ')

// What the buyer sees at their order link (spec 6.5). No script is needed: the
// QR code is drawn on the server. Works the same in a server component and a
// test.
export function OrderDetails({
  order,
  payment,
  pickupInstructions,
}: OrderDetailsProps) {
  const t = useTranslations('Order')
  const money = useMoney()
  const format = useFormatter()

  const deadline = format.dateTime(order.expiresAt, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: SHOP_TIME_ZONE,
  })
  const waiting = order.stage === 'awaiting_payment'
  const cash = order.paymentMethod === 'cash_on_pickup'
  const stageKey:
    | Exclude<OrderStage, 'awaiting_payment'>
    | 'awaiting_payment'
    | 'awaiting_cash' = waiting && cash ? 'awaiting_cash' : order.stage

  const pickupBlock = pickupInstructions !== '' && (
    <div className={css.instructions}>
      <p className={css.instructionsTitle}>{t('cash.pickup')}</p>
      <p>{pickupInstructions}</p>
    </div>
  )

  return (
    <>
      <h1>{t('title', { number: order.number })}</h1>
      <h2 className={css.stage}>{t(`stage.${stageKey}`)}</h2>

      {waiting && !cash && payment && (
        <section className={css.pay} aria-labelledby="order-pay">
          <h2 id="order-pay">{t('pay.heading')}</h2>
          {payment.status === 'not_configured' ? (
            <p className={css.notice}>{t('pay.notConfigured')}</p>
          ) : (
            <>
              <p>{t('pay.scan')}</p>
              {payment.spayd && (
                <QrCode
                  value={payment.spayd}
                  label={t('pay.qrLabel')}
                  className={css.qr}
                />
              )}
              <dl className={css.details}>
                <div>
                  <dt>{t('pay.account')}</dt>
                  <dd>{payment.account}</dd>
                </div>
                <div>
                  <dt>{t('pay.iban')}</dt>
                  <dd>{groupIban(payment.iban)}</dd>
                </div>
                <div>
                  <dt>{t('pay.amount')}</dt>
                  <dd>{money(payment.amountMinor, order.currency)}</dd>
                </div>
                <div>
                  <dt>{t('pay.variableSymbol')}</dt>
                  <dd>{payment.variableSymbol}</dd>
                </div>
              </dl>
            </>
          )}
        </section>
      )}

      {waiting && cash && (
        <section className={css.pay} aria-labelledby="order-cash">
          <h2 id="order-cash">{t('cash.heading')}</h2>
          <p>{t('cash.text')}</p>
          {pickupBlock}
        </section>
      )}

      {waiting && (
        <>
          <p>{t(cash ? 'deadlineCash' : 'deadline', { date: deadline })}</p>
          <p className={css.hint}>{t('keepPage')}</p>
        </>
      )}

      {order.stage === 'expired' && (
        <p>{t(cash ? 'expiredCash' : 'expiredText')}</p>
      )}

      {order.stage === 'paid' && (
        <>
          <p>
            {t(
              order.shippingMethod === 'zasilkovna'
                ? 'paidShipping'
                : 'paidPickup',
            )}
          </p>
          {order.shippingMethod === 'pickup' && pickupBlock}
        </>
      )}

      {order.stage === 'shipped' && (
        <p>
          {order.trackingNumber
            ? t('shippedTracking', { tracking: order.trackingNumber })
            : t('shippedNoTracking')}
        </p>
      )}

      <section className={css.summary} aria-labelledby="order-summary">
        <h2 id="order-summary">{t('summary.heading')}</h2>
        <ul className={css.lines}>
          {order.items.map((item, index) => (
            <li key={index} className={css.line}>
              <span>{item.title}</span>
              <span>{money(item.priceMinor, order.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className={css.totals}>
          <div>
            <dt>{t('summary.shipping')}</dt>
            <dd>
              {order.shippingCostMinor === 0
                ? t('summary.shippingFree')
                : money(order.shippingCostMinor, order.currency)}
            </dd>
          </div>
          <div className={css.total}>
            <dt>{t('summary.total')}</dt>
            <dd>{money(order.totalMinor, order.currency)}</dd>
          </div>
        </dl>
        {order.shippingDetails && (
          <p>{t('summary.pickupPoint', { point: order.shippingDetails })}</p>
        )}
      </section>
    </>
  )
}
