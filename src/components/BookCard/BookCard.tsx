import { useFormatter, useTranslations } from 'next-intl'
import { Badge } from '@/components/Badge'
import { BookPhoto } from '@/components/BookPhoto'
import { Link } from '@/i18n/navigation'
import { bookPath } from '@/lib/book-path'
import type { CatalogItem } from '@/server/catalog'
import css from './BookCard.module.scss'

// The card is 260 to about 280 px wide on a large screen, half the screen on a
// medium one, and the full width on a phone.
const COVER_SIZES = '(min-width: 1200px) 280px, (min-width: 560px) 50vw, 100vw'

type BookCardProps = {
  book: CatalogItem
  imageBaseUrl: string
  // One of the first cards on the page: its cover loads at once.
  priority?: boolean
}

export function BookCard({ book, imageBaseUrl, priority }: BookCardProps) {
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
      <div className={css.cover}>
        {book.cover ? (
          // Empty alt: the title link below already names the book.
          <BookPhoto
            photo={book.cover}
            baseUrl={imageBaseUrl}
            alt=""
            sizes={COVER_SIZES}
            priority={priority}
            className={css.coverImage}
          />
        ) : (
          t('noPhoto')
        )}
      </div>
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
