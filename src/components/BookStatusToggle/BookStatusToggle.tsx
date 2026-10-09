'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { SetHiddenResult } from '@/server/admin/book-status'
import css from './BookStatusToggle.module.scss'

type BookStatusToggleProps = {
  status: 'available' | 'reserved' | 'sold' | 'hidden'
  setHidden: (hidden: boolean) => Promise<SetHiddenResult>
}

type ErrorKey = 'reserved' | 'sold' | 'notFound'

// Hide or show one book. Reserved and sold books get no button: they leave
// those states through expiry or an order, never through this toggle.
export function BookStatusToggle({ status, setHidden }: BookStatusToggleProps) {
  const t = useTranslations('Admin.books')
  const router = useRouter()
  const [error, setError] = useState<ErrorKey | null>(null)
  const [pending, setPending] = useState(false)

  const canToggle = status === 'available' || status === 'hidden'

  async function onClick() {
    setPending(true)
    try {
      const result = await setHidden(status === 'available')
      if (result.outcome === 'refused') {
        setError(result.reason === 'not_found' ? 'notFound' : result.reason)
      } else {
        setError(null)
      }
      // Refresh in every case, so a stale status on the page corrects itself.
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  if (!canToggle && !error) return null

  return (
    <div className={css.toggle}>
      {canToggle && (
        <button
          type="button"
          className={css.button}
          disabled={pending}
          onClick={onClick}
        >
          {status === 'available' ? t('hide') : t('unhide')}
        </button>
      )}
      {error && (
        <p role="alert" className={css.error}>
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  )
}
