import { getTranslations } from 'next-intl/server'
import { AdminBookRow } from '@/components/AdminBookRow'
import { SignOutButton } from '@/components/SignOutButton'
import { Link } from '@/i18n/navigation'
import { requireAdmin } from '@/lib/auth'
import { listAdminBooks } from '@/server/admin/book-list'
import { parseStatusFilter, STATUS_FILTERS } from '@/server/admin/status-filter'
import { setBookHiddenAction } from './actions'
import css from './page.module.scss'

export default async function AdminHome({
  searchParams,
}: PageProps<'/[locale]/admin'>) {
  // Layouts don't re-render on navigation, so every admin page checks for itself.
  const actor = await requireAdmin()
  const { status: rawStatus } = await searchParams
  const status = parseStatusFilter(rawStatus)
  const now = new Date()
  const { items, counts } = await listAdminBooks(actor, { status, now })
  const t = await getTranslations('Admin')

  return (
    <main className={css.main}>
      <header className={css.header}>
        <h1>{t('books.heading')}</h1>
        <SignOutButton />
      </header>
      <p>{t('signedInAs', { email: actor.email })}</p>

      <nav aria-label={t('books.filterLabel')}>
        <ul className={css.filters}>
          {STATUS_FILTERS.map((filter) => (
            <li key={filter}>
              <Link
                href={filter === 'all' ? '/admin' : `/admin?status=${filter}`}
                className={css.filter}
                aria-current={filter === status ? 'page' : undefined}
              >
                {t(`books.filters.${filter}`)} ({counts[filter]})
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {items.length === 0 ? (
        <p className={css.empty}>{t('books.empty')}</p>
      ) : (
        <ul className={css.list}>
          {items.map((book) => (
            <li key={book.id}>
              <AdminBookRow
                book={book}
                now={now}
                setHidden={setBookHiddenAction.bind(null, book.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
