import { useFormatter, useTranslations } from 'next-intl'
import { Badge } from '@/components/Badge'
import { BookStatusToggle } from '@/components/BookStatusToggle'
import { ChangedAgo } from '@/components/ChangedAgo'
import { Link } from '@/i18n/navigation'
import type { AdminBookItem } from '@/server/admin/book-list'
import type { SetHiddenResult } from '@/server/admin/book-status'
import css from './AdminBookRow.module.scss'

type AdminBookRowProps = {
  book: AdminBookItem
  now: Date
  setHidden: (hidden: boolean) => Promise<SetHiddenResult>
}

const tone = {
  available: 'neutral',
  hidden: 'neutral',
  reserved: 'reserved',
  sold: 'sold',
} as const

export function AdminBookRow({ book, now, setHidden }: AdminBookRowProps) {
  const t = useTranslations('Admin.books')
  const format = useFormatter()

  // Minor units: whole crowns without decimals, anything else with two.
  const fractionDigits = book.priceMinor % 100 === 0 ? 0 : 2
  const price = format.number(book.priceMinor / 100, {
    style: 'currency',
    currency: book.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  return (
    <article className={css.row}>
      <div className={css.main}>
        <h2 className={css.title}>{book.title}</h2>
        <p>{book.author}</p>
        <p className={css.price}>{price}</p>
        <p className={css.meta}>
          <Badge tone={tone[book.status]}>{t(`status.${book.status}`)}</Badge>
          {book.photoCount === 0 && <Badge>{t('noPhotos')}</Badge>}
        </p>
        <p className={css.changed}>
          <ChangedAgo date={book.updatedAt} now={now} />
        </p>
      </div>
      <div className={css.actions}>
        {/* The visible word starts the accessible name, so the title tells links apart. */}
        <Link
          href={`/admin/books/${book.id}/edit`}
          className={css.edit}
          aria-label={t('edit', { title: book.title })}
        >
          {t('editShort')}
        </Link>
        <BookStatusToggle status={book.status} setHidden={setHidden} />
      </div>
    </article>
  )
}
