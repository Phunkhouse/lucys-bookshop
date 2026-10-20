import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { BookCard } from '@/components/BookCard'
import { CatalogFilters } from '@/components/CatalogFilters'
import { CatalogNoResults } from '@/components/CatalogNoResults'
import { Pagination } from '@/components/Pagination'
import { env } from '@/config/env'
import { shopConfig } from '@/config/shop'
import { catalogFilterOptions, listCatalog } from '@/server/catalog'
import {
  canonicalCatalogPath,
  parseCatalogQuery,
  serializeCatalogQuery,
} from '@/server/catalog-query'
import css from './page.module.scss'

type SearchParams = Record<string, string | string[] | undefined>

type HomeProps = { searchParams: Promise<SearchParams> }

// A view with a search, filters or another sort is not worth indexing (ADR
// 0022): the plain catalog and the book pages are. Page numbers alone are fine.
export async function generateMetadata({
  searchParams,
}: HomeProps): Promise<Metadata> {
  const query = parseCatalogQuery(await searchParams)
  const filtered = serializeCatalogQuery({ ...query, page: 1 }) !== ''
  return filtered ? { robots: { index: false, follow: true } } : {}
}

export default async function Home({ searchParams }: HomeProps) {
  // The catalog depends on the current time (reservations expire), so it is
  // rendered on every request, never at build time.
  await connection()

  const t = await getTranslations()
  const now = new Date()
  const params = await searchParams
  const query = parseCatalogQuery(params)

  // Send the visitor to the short form of the same view (see the function).
  const clean = canonicalCatalogPath(params)
  if (clean !== null) redirect(clean)

  const [{ items: books, total, page, pageCount }, options] = await Promise.all(
    [listCatalog(query, now), catalogFilterOptions(now)],
  )

  // Without any search or filter, no books means the shop itself is empty.
  const narrowed = serializeCatalogQuery({ ...query, page: 1, sort: 'newest' })
  const shopIsEmpty = total === 0 && narrowed === ''

  return (
    <main className={css.main}>
      <h1>{t('Home.title', { shopName: shopConfig.name })}</h1>
      <p>{t('Home.intro')}</p>

      <section aria-labelledby="catalog-heading" className={css.catalog}>
        <h2 id="catalog-heading">{t('Catalog.heading')}</h2>
        {shopIsEmpty ? (
          <div className={css.empty}>
            <p className={css.emptyTitle}>{t('Catalog.empty.title')}</p>
            <p>{t('Catalog.empty.hint')}</p>
          </div>
        ) : (
          <>
            <CatalogFilters query={query} options={options} />
            <p>{t('Catalog.count', { count: total })}</p>
            {books.length === 0 ? (
              <CatalogNoResults />
            ) : (
              <ul className={css.grid}>
                {books.map((book, index) => (
                  <li key={book.shortId}>
                    {/* The first cards are on screen at once: their covers load first. */}
                    <BookCard
                      book={book}
                      imageBaseUrl={env.IMAGE_BASE_URL}
                      priority={index < 4}
                    />
                  </li>
                ))}
              </ul>
            )}
            <Pagination
              query={{ ...query, page }}
              page={page}
              pageCount={pageCount}
            />
          </>
        )}
      </section>
    </main>
  )
}
