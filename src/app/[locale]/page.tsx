import { getTranslations } from 'next-intl/server'
import { shopConfig } from '@/config/shop'

import css from './page.module.scss'

export default async function Home() {
  const t = await getTranslations('Home')

  return (
    <main>
      <h1>{t('title', { shopName: shopConfig.name })}</h1>
      <p>{t('intro')}</p>
    </main>
  )
}
