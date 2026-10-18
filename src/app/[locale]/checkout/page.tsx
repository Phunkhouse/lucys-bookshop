import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { CheckoutForm } from '@/components/CheckoutForm'
import { shopConfig } from '@/config/shop'
import { getShopSettings } from '@/server/settings'
import { validateCartAction } from '../cart/actions'
import { placeOrderAction } from './actions'
import css from './page.module.scss'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Checkout')
  return {
    title: `${t('title')} | ${shopConfig.name}`,
    robots: { index: false },
  }
}

export default async function CheckoutPage() {
  // The seller can change the settings at any time: read them on every request.
  await connection()
  const settings = await getShopSettings()

  return (
    <main className={css.main}>
      <CheckoutForm
        validate={validateCartAction}
        submit={placeOrderAction}
        zasilkovnaPriceMinor={settings.zasilkovnaPriceMinor}
        pickupInstructions={settings.pickupInstructions}
      />
    </main>
  )
}
