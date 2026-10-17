import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/Badge'
import { BookPhoto } from '@/components/BookPhoto'
import { Link } from '@/i18n/navigation'
import type { BookDetail } from '@/server/catalog'
import css from './BookDetailView.module.scss'

// The photo column: about 40% of the page next to the text from 768 px up
// (at most 458 px), the full width on a phone.
const PHOTO_SIZES = '(min-width: 1232px) 458px, (min-width: 768px) 40vw, 100vw'

type BookDetailViewProps = {
  book: BookDetail
  imageBaseUrl: string
}

export function BookDetailView({ book, imageBaseUrl }: BookDetailViewProps) {
  const t = useTranslations('Book')
  const tGenres = useTranslations('Genres')
  const format = useFormatter()
  const locale = useLocale()

  // Money is stored in minor units (1/100 of the currency). Whole crowns show
  // without decimals ("189 Kč"), anything else with two ("189,50 Kč").
  const fractionDigits = book.priceMinor % 100 === 0 ? 0 : 2
  const price = format.number(book.priceMinor / 100, {
    style: 'currency',
    currency: book.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  // "cs" -> "čeština"; falls back to the code if the browser doesn't know it.
  const language =
    new Intl.DisplayNames(locale, { type: 'language' }).of(book.language) ??
    book.language

  const soldDate = book.soldAt
    ? format.dateTime(book.soldAt, { dateStyle: 'long' })
    : null

  return (
    <article className={css.detail}>
      <p>
        <Link href="/">{t('detail.back')}</Link>
      </p>

      <div className={css.layout}>
        {book.images.length > 0 ? (
          // Photos side by side, swiped through on a phone (scroll-snap). A list
          // that scrolls needs a tab stop so a keyboard can reach it.
          <ul
            role="list"
            className={css.gallery}
            aria-label={t('photos.galleryLabel')}
            tabIndex={book.images.length > 1 ? 0 : undefined}
          >
            {book.images.map((photo, index) => {
              const many = book.images.length > 1
              const place = { n: index + 1, total: book.images.length }
              return (
                <li key={photo.baseKey} className={css.slide}>
                  <figure className={css.figure}>
                    <BookPhoto
                      photo={photo}
                      baseUrl={imageBaseUrl}
                      alt={
                        many
                          ? t('photos.alt', { title: book.title, ...place })
                          : book.title
                      }
                      sizes={PHOTO_SIZES}
                      priority={index === 0}
                      className={css.photo}
                    />
                    {many && (
                      <figcaption>{t('photos.caption', place)}</figcaption>
                    )}
                  </figure>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className={css.cover}>{t('noPhoto')}</div>
        )}

        <div className={css.info}>
          {book.status !== 'available' && (
            <p>
              <Badge tone={book.status}>{t(`status.${book.status}`)}</Badge>
            </p>
          )}
          <h1>{book.title}</h1>
          <p className={css.author}>{book.author}</p>
          <p className={css.price}>{price}</p>

          <div className={css.buy}>
            <button type="button" disabled aria-describedby="buy-message">
              {t('detail.addToCart')}
            </button>
            <p id="buy-message">
              {book.status === 'sold'
                ? t('detail.message.sold', { date: soldDate ?? '' })
                : t(`detail.message.${book.status}`)}
            </p>
          </div>

          <dl className={css.facts}>
            <dt>{t('detail.fields.condition')}</dt>
            <dd>
              {t(`condition.${book.condition}`)}
              {book.conditionNote && <> – {book.conditionNote}</>}
            </dd>
            <dt>{t('detail.fields.language')}</dt>
            <dd>{language}</dd>
            {book.genres.length > 0 && (
              <>
                <dt>{t('detail.fields.genres')}</dt>
                <dd>{book.genres.map((key) => tGenres(key)).join(', ')}</dd>
              </>
            )}
            {book.isbn && (
              <>
                <dt>{t('detail.fields.isbn')}</dt>
                <dd>{book.isbn}</dd>
              </>
            )}
          </dl>

          {book.description && <p>{book.description}</p>}
        </div>
      </div>
    </article>
  )
}
