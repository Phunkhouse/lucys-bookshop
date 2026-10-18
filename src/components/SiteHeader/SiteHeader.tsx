import { useTranslations } from 'next-intl'
import { CartLink } from '@/components/CartLink'
import { shopConfig } from '@/config/shop'
import { Link } from '@/i18n/navigation'
import css from './SiteHeader.module.scss'

export function SiteHeader() {
  const t = useTranslations('Nav')

  return (
    <header className={css.header}>
      <Link href="/" className={css.name}>
        {shopConfig.name}
      </Link>
      <nav aria-label={t('label')}>
        <ul className={css.links}>
          <li>
            <Link href="/">{t('catalog')}</Link>
          </li>
          <li>
            <CartLink />
          </li>
        </ul>
      </nav>
    </header>
  )
}
