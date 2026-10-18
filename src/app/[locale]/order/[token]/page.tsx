import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { OrderDetails } from '@/components/OrderDetails'
import { env } from '@/config/env'
import { shopConfig } from '@/config/shop'
import { getOrderView } from '@/server/order-view'
import { paymentInstructions } from '@/server/payment-instructions'
import { getShopSettings } from '@/server/settings'
import css from './page.module.scss'

// The link is the only secret: keep it out of search results and out of the
// Referer header of anything the page links to.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Order')
  return {
    title: `${t('pageTitle')} | ${shopConfig.name}`,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function OrderPage({
  params,
}: PageProps<'/[locale]/order/[token]'>) {
  // Expiry depends on the clock and the seller can change the order at any time.
  await connection()
  const { token } = await params

  const now = new Date()
  const order = await getOrderView(token, now)
  if (!order) notFound()

  const settings = await getShopSettings()

  return (
    <main className={css.main}>
      <OrderDetails
        order={order}
        payment={paymentInstructions(order, env.SELLER_IBAN)}
        pickupInstructions={settings.pickupInstructions}
      />
    </main>
  )
}
