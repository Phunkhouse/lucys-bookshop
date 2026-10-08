import { useFormatter, useTranslations } from 'next-intl'
import { Badge } from '@/components/Badge'
import { Link } from '@/i18n/navigation'
import { bookPath } from '@/lib/book-path'
import type { CatalogItem } from '@/server/catalog'
import css from './BookCard.module.scss'

type BookCardProps = {
  book: CatalogItem
}

export function BookCard({ book }: BookCardProps) {
  const t = useTranslations('Book')
  const tGenres = useTranslations('Genres')
  const format = useFormatter()

  // Money is stored in minor units (1/100 of the currency). Whole crowns show
  // without decimals ("189 Kč"), anything else with two ("189,50 Kč").
  const fractionDigits = book.priceMinor % 100 === 0 ? 0 : 2
  const price = format.number(book.priceMinor / 100, {
    style: 'currency',
    currency: book.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  return (
    <article className={css.card}>
      {/* Photos arrive with the upload pipeline (M2). Until then every book gets the placeholder. */}
      <div className={css.cover}>{t('noPhoto')}</div>
      <div className={css.body}>
        {book.status !== 'available' && (
          <p>
            <Badge tone={book.status}>{t(`status.${book.status}`)}</Badge>
          </p>
        )}
        <h2 className={css.title}>
          <Link href={bookPath(book)} className={css.link}>
            {book.title}
          </Link>
        </h2>
        <p className={css.author}>{book.author}</p>
        <p className={css.meta}>
          {[
            t(`condition.${book.condition}`),
            ...book.genres.map((key) => tGenres(key)),
          ].join(' · ')}
        </p>
        <p className={css.price}>{price}</p>
      </div>
    </article>
  )
}
