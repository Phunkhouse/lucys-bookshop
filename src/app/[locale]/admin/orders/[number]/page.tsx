import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AdminOrderDetail } from '@/components/AdminOrderDetail'
import { OrderActions } from '@/components/OrderActions'
import { env } from '@/config/env'
import { shopConfig } from '@/config/shop'
import { Link } from '@/i18n/navigation'
import { requireAdmin } from '@/lib/auth'
import { availableActions } from '@/server/admin/order-actions'
import { getAdminOrder } from '@/server/admin/order-detail'
import { parseOrderNumber } from '@/server/admin/order-number'
import {
  cancelOrderAction,
  extendReservationAction,
  markCompletedAction,
  markPaidAction,
  markShippedAction,
  refundOrderAction,
  setOrderNoteAction,
  setTrackingNumberAction,
} from '../actions'
import css from '../../page.module.scss'

export default async function AdminOrderPage({
  params,
}: PageProps<'/[locale]/admin/orders/[number]'>) {
  // Layouts don't re-render on navigation, so every admin page checks for itself.
  const actor = await requireAdmin()
  const number = parseOrderNumber((await params).number)
  if (number === null) notFound()

  const now = new Date()
  const order = await getAdminOrder(actor, number, now)
  if (!order) notFound()
  const t = await getTranslations('Admin.orders.detail')

  return (
    <main className={css.main}>
      <Link href="/admin/orders">{t('back')}</Link>
      <AdminOrderDetail
        order={order}
        now={now}
        buyerOrderUrl={`${env.BETTER_AUTH_URL}/order/${order.publicToken}`}
        shopName={shopConfig.name}
      >
        <OrderActions
          actions={availableActions(
            order.stage,
            order.paymentMethod,
            order.shippingMethod,
          )}
          trackingNumber={order.trackingNumber}
          note={order.note}
          markPaid={markPaidAction.bind(null, order.id)}
          cancel={cancelOrderAction.bind(null, order.id)}
          refund={refundOrderAction.bind(null, order.id)}
          extend={extendReservationAction.bind(null, order.id)}
          markShipped={markShippedAction.bind(null, order.id)}
          setTracking={setTrackingNumberAction.bind(null, order.id)}
          complete={markCompletedAction.bind(null, order.id)}
          setNote={setOrderNoteAction.bind(null, order.id)}
        />
      </AdminOrderDetail>
    </main>
  )
}
