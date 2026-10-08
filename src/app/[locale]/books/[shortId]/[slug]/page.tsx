import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { cache } from 'react'
import { BookDetailView } from '@/components/BookDetailView'
import { shopConfig } from '@/config/shop'
import { redirectTarget } from '@/lib/book-path'
import { getBookByShortId } from '@/server/catalog'
import css from './page.module.scss'

// The page and its metadata both need the book. Fetch it once per request.
const getBook = cache((shortId: string) =>
  getBookByShortId(shortId, new Date()),
)

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/books/[shortId]/[slug]'>): Promise<Metadata> {
  await connection()
  const { shortId } = await params
  const book = await getBook(shortId)
  if (!book) return {}

  const description =
    book.description.slice(0, 160) ||
    (await getTranslations('Site'))('description')
  return {
    title: `${book.title} – ${book.author} | ${shopConfig.name}`,
    description,
  }
}

export default async function BookPage({
  params,
}: PageProps<'/[locale]/books/[shortId]/[slug]'>) {
  // Reservations expire with time, so the page is rendered on every request.
  await connection()

  const { shortId, slug } = await params
  const book = await getBook(shortId)
  if (!book) notFound()

  // The id is the key, the slug only decoration: send outdated links to the current URL.
  const target = redirectTarget(book, slug)
  if (target) permanentRedirect(target)

  return (
    <main className={css.main}>
      <BookDetailView book={book} />
    </main>
  )
}
