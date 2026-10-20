import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { BookCard } from '@/components/BookCard'
import { env } from '@/config/env'
import { shopConfig } from '@/config/shop'
import { listCatalog } from '@/server/catalog'
import { defaultCatalogQuery } from '@/server/catalog-query'
import css from './page.module.scss'

export default async function Home() {
  // The catalog depends on the current time (reservations expire), so it is
  // rendered on every request, never at build time.
  await connection()

  const t = await getTranslations()
  // Filters, sorts and pages are wired to the URL in a later M6 step.
  const { items: books, total } = await listCatalog(
    defaultCatalogQuery,
    new Date(),
  )

  return (
    <main className={css.main}>
      <h1>{t('Home.title', { shopName: shopConfig.name })}</h1>
      <p>{t('Home.intro')}</p>

      <section aria-labelledby="catalog-heading" className={css.catalog}>
        <h2 id="catalog-heading">{t('Catalog.heading')}</h2>
        {books.length === 0 ? (
          <div className={css.empty}>
            <p className={css.emptyTitle}>{t('Catalog.empty.title')}</p>
            <p>{t('Catalog.empty.hint')}</p>
          </div>
        ) : (
          <>
            <p>{t('Catalog.count', { count: total })}</p>
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
          </>
        )}
      </section>
    </main>
  )
}
