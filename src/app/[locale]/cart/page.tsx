import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CartView } from '@/components/CartView'
import { env } from '@/config/env'
import { shopConfig } from '@/config/shop'
import { validateCartAction } from './actions'
import css from './page.module.scss'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Cart')
  return {
    title: `${t('title')} | ${shopConfig.name}`,
    robots: { index: false },
  }
}

export default function CartPage() {
  return (
    <main className={css.main}>
      <CartView
        imageBaseUrl={env.IMAGE_BASE_URL}
        validate={validateCartAction}
      />
    </main>
  )
}
