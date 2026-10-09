import { getTranslations } from 'next-intl/server'
import { BookForm } from '@/components/BookForm'
import { Link } from '@/i18n/navigation'
import { requireAdmin } from '@/lib/auth'
import { listGenreKeys } from '@/server/admin/book-listing'
import { createBookAction } from '../actions'
import css from '../form-page.module.scss'

export default async function NewBookPage() {
  await requireAdmin()
  const genres = await listGenreKeys()
  const t = await getTranslations('Admin.form')

  return (
    <main className={css.main}>
      <Link href="/admin">{t('back')}</Link>
      <h1>{t('newTitle')}</h1>
      <BookForm genres={genres} action={createBookAction} />
    </main>
  )
}
