import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import css from './CatalogNoResults.module.scss'

// Shown when the search or filters match no book (not when the shop is empty).
export function CatalogNoResults() {
  const t = useTranslations('Catalog.noResults')
  return (
    <div className={css.empty}>
      <p className={css.title}>{t('title')}</p>
      <p>{t('hint')}</p>
      <p>
        <Link href="/" className={css.reset}>
          {t('reset')}
        </Link>
      </p>
    </div>
  )
}
