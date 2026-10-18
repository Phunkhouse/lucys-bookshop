'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useCart } from '@/lib/use-cart'

// "Košík" in the header, with the number of books once there are any. The
// number is read in the browser, so it appears just after the page loads.
export function CartLink() {
  const t = useTranslations('Nav')
  const { items } = useCart()
  const count = items.length

  return (
    // The label starts with the visible word, as accessibility rules ask.
    <Link
      href="/cart"
      aria-label={count > 0 ? t('cartCount', { count }) : undefined}
    >
      {t('cart')}
      {count > 0 && <> ({count})</>}
    </Link>
  )
}
