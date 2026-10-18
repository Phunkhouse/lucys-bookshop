'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BookPhoto } from '@/components/BookPhoto'
import { Link } from '@/i18n/navigation'
import { bookPath } from '@/lib/book-path'
import type { CartInput } from '@/lib/cart-schema'
import { useCart } from '@/lib/use-cart'
import { useMoney } from '@/lib/use-money'
import type { CartValidation } from '@/server/cart'
import type { CartLine } from '@/server/cart-rules'
import css from './CartView.module.scss'

type ValidateResult = { ok: true; validation: CartValidation } | { ok: false }

type CartViewProps = {
  imageBaseUrl: string
  // The server's answer for a cart (spec 6.3): which books can still be bought
  // and at what price.
  validate: (items: CartInput) => Promise<ValidateResult>
}

// What the server said about one exact cart. `key` says which cart that was,
// so an answer for an older cart is never shown as current.
type Answer =
  | { key: string; kind: 'ok'; validation: CartValidation }
  | { key: string; kind: 'failed' }

type Removed = { shortId: string; title: string | null; reason: string }

type BuyableLine = Extract<CartLine, { kind: 'ok' | 'price_changed' }>

// 4rem thumbnail
const THUMB_SIZES = '64px'

export function CartView({ imageBaseUrl, validate }: CartViewProps) {
  const t = useTranslations('Cart')
  const money = useMoney()
  const { items, remove, acceptPrice } = useCart()
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [removed, setRemoved] = useState<Removed[]>([])
  const [attempt, setAttempt] = useState(0)

  const key = JSON.stringify(items)

  useEffect(() => {
    if (items.length === 0) return
    let ignore = false

    validate(items).then(
      (result) => {
        if (ignore) return
        if (!result.ok) {
          setAnswer({ key, kind: 'failed' })
          return
        }
        // Books that were taken or withdrawn leave the cart (spec 6.3); the
        // buyer is told below. The answer is stored for the smaller cart, so
        // the page does not flash while it is checked again.
        const gone = result.validation.lines.filter(
          (line) => line.kind === 'unavailable' || line.kind === 'gone',
        )
        const goneIds = new Set(gone.map((line) => line.shortId))
        const kept = items.filter((item) => !goneIds.has(item.shortId))
        for (const id of goneIds) remove(id)
        if (gone.length > 0) {
          setRemoved((previous) => [
            ...previous,
            ...gone.map((line) => ({
              shortId: line.shortId,
              title: line.kind === 'gone' ? null : line.title,
              reason: line.kind === 'unavailable' ? line.reason : 'gone',
            })),
          ])
        }
        setAnswer({
          key: JSON.stringify(kept),
          kind: 'ok',
          validation: {
            ...result.validation,
            lines: result.validation.lines.filter(
              (line) => !goneIds.has(line.shortId),
            ),
          },
        })
      },
      () => {
        if (!ignore) setAnswer({ key, kind: 'failed' })
      },
    )

    return () => {
      ignore = true
    }
    // `remove` and `validate` do not change; the cart and the retry counter do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const current = answer?.key === key ? answer : null
  const inCart = new Set(items.map((item) => item.shortId))
  // While a newer answer is on its way, keep showing the last one for the books still in the cart.
  const shown =
    answer?.kind === 'ok'
      ? answer.validation.lines.filter(
          (line): line is BuyableLine =>
            (line.kind === 'ok' || line.kind === 'price_changed') &&
            inCart.has(line.shortId),
        )
      : []

  const removedNotes = removed.length > 0 && (
    <div className={css.notice} role="status">
      <p>{t('removed.heading')}</p>
      <ul>
        {removed.map((entry) => (
          <li key={entry.shortId}>
            {entry.title === null
              ? t('removed.gone')
              : t(`removed.${entry.reason === 'sold' ? 'sold' : 'reserved'}`, {
                  title: entry.title,
                })}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={css.button}
        onClick={() => setRemoved([])}
      >
        {t('removed.dismiss')}
      </button>
    </div>
  )

  if (items.length === 0) {
    return (
      <>
        <h1>{t('title')}</h1>
        {removedNotes}
        <div className={css.empty}>
          <p className={css.emptyTitle}>{t('empty.title')}</p>
          <p>{t('empty.hint')}</p>
          <p>
            <Link href="/">{t('empty.browse')}</Link>
          </p>
        </div>
      </>
    )
  }

  const failed = current?.kind === 'failed'
  const loading = current === null && !failed

  return (
    <>
      <h1>{t('title')}</h1>
      {removedNotes}

      {failed && (
        <div className={css.notice} role="alert">
          <p>{t('failed')}</p>
          <button
            type="button"
            className={css.button}
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('retry')}
          </button>
        </div>
      )}

      {shown.length === 0 && loading && <p role="status">{t('loading')}</p>}

      <ul className={css.lines} aria-busy={loading}>
        {shown.map((line) => (
          <li key={line.shortId} className={css.line}>
            <div className={css.thumb}>
              {line.cover && (
                <BookPhoto
                  photo={line.cover}
                  baseUrl={imageBaseUrl}
                  alt=""
                  sizes={THUMB_SIZES}
                  className={css.thumbImage}
                />
              )}
            </div>
            <div className={css.info}>
              <p className={css.title}>
                <Link href={bookPath(line)}>{line.title}</Link>
              </p>
              <p className={css.author}>{line.author}</p>
              {line.kind === 'price_changed' && (
                <div className={css.changed}>
                  <p>
                    {t('priceChanged', {
                      before: money(line.seenPriceMinor, line.currency),
                      now: money(line.priceMinor, line.currency),
                    })}
                  </p>
                  <button
                    type="button"
                    className={css.button}
                    onClick={() => acceptPrice(line.shortId, line.priceMinor)}
                  >
                    {t('acceptPrice')}
                  </button>
                </div>
              )}
            </div>
            <div className={css.side}>
              <p className={css.price}>
                {money(line.priceMinor, line.currency)}
              </p>
              <button
                type="button"
                className={css.button}
                aria-label={t('removeLabel', { title: line.title })}
                onClick={() => remove(line.shortId)}
              >
                {t('remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {current?.kind === 'ok' && current.validation.lines.length > 0 && (
        <>
          <p className={css.subtotal}>
            <span>{t('subtotal')}</span>
            <strong>
              {money(
                current.validation.subtotalMinor,
                current.validation.currency,
              )}
            </strong>
          </p>
          {/* A changed price has to be accepted first, as checkout insists. */}
          {current.validation.lines.every((line) => line.kind === 'ok') && (
            <Link href="/checkout" className={css.checkout}>
              {t('checkout')}
            </Link>
          )}
        </>
      )}
    </>
  )
}
