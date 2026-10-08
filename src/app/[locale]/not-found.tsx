import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import css from './not-found.module.scss'

export default async function NotFound() {
  const t = await getTranslations('NotFound')

  return (
    <main className={css.main}>
      <h1>{t('title')}</h1>
      <p>{t('text')}</p>
      <p>
        <Link href="/">{t('back')}</Link>
      </p>
    </main>
  )
}
