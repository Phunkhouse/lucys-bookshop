import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BookForm } from '@/components/BookForm'
import { Link } from '@/i18n/navigation'
import { requireAdmin } from '@/lib/auth'
import { getListingForEdit, listGenreKeys } from '@/server/admin/book-listing'
import { updateBookAction } from '../../actions'
import css from '../../form-page.module.scss'

export default async function EditBookPage({
  params,
}: PageProps<'/[locale]/admin/books/[id]/edit'>) {
  const actor = await requireAdmin()
  const { id } = await params
  const [edit, genres] = await Promise.all([
    getListingForEdit(actor, id),
    listGenreKeys(),
  ])
  if (!edit) notFound()
  const t = await getTranslations('Admin.form')

  return (
    <main className={css.main}>
      <Link href="/admin">{t('back')}</Link>
      <h1>{t('editTitle')}</h1>
      <BookForm
        genres={genres}
        initialValues={edit.values}
        action={updateBookAction.bind(null, edit.id)}
      />
    </main>
  )
}
