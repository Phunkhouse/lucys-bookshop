'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useCart } from '@/lib/use-cart'
import css from './AddToCartButton.module.scss'

type AddToCartButtonProps = {
  shortId: string
  priceMinor: number
  status: 'available' | 'reserved' | 'sold'
  // Already formatted, for the sold message.
  soldDate: string
}

// The buy area of the book page. The server decides whether the book can be
// bought (and checks again at checkout); this only keeps the buyer's list.
export function AddToCartButton({
  shortId,
  priceMinor,
  status,
  soldDate,
}: AddToCartButtonProps) {
  const t = useTranslations('Book.detail')
  const { items, add, remove } = useCart()
  const [full, setFull] = useState(false)

  if (status !== 'available') {
    return (
      <div className={css.buy}>
        <button type="button" disabled aria-describedby="buy-message">
          {t('addToCart')}
        </button>
        <p id="buy-message">
          {status === 'sold'
            ? t('message.sold', { date: soldDate })
            : t('message.reserved')}
        </p>
      </div>
    )
  }

  const inCart = items.some((item) => item.shortId === shortId)

  return (
    <div className={css.buy}>
      {inCart ? (
        <button type="button" onClick={() => remove(shortId)}>
          {t('removeFromCart')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            const result = add({ shortId, priceMinorSeen: priceMinor })
            setFull(result === 'cart_full')
          }}
        >
          {t('addToCart')}
        </button>
      )}
      {/* Always in the page, so a screen reader announces what appears in it. */}
      <p role="status">
        {inCart && (
          <>
            {t('message.inCart')} <Link href="/cart">{t('viewCart')}</Link>
          </>
        )}
        {full && !inCart && t('message.cartFull')}
      </p>
    </div>
  )
}
