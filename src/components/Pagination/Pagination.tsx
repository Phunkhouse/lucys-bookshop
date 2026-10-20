import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { catalogHref } from '@/lib/catalog-href'
import type { CatalogQuery } from '@/server/catalog-query'
import css from './Pagination.module.scss'

type PaginationProps = {
  // Every link keeps the filters, sort and search of this query.
  query: CatalogQuery
  page: number
  pageCount: number
}

// The first and last page, the current one and its neighbours; a gap (null)
// stands for the pages in between.
function visiblePages(page: number, pageCount: number): (number | null)[] {
  const wanted = new Set(
    [1, page - 1, page, page + 1, pageCount].filter(
      (n) => n >= 1 && n <= pageCount,
    ),
  )
  const pages: (number | null)[] = []
  let previous = 0
  for (const n of [...wanted].sort((a, b) => a - b)) {
    if (n - previous > 1) pages.push(null)
    pages.push(n)
    previous = n
  }
  return pages
}

export function Pagination({ query, page, pageCount }: PaginationProps) {
  const t = useTranslations('Catalog.pagination')
  if (pageCount <= 1) return null

  const hrefFor = (n: number) => catalogHref({ ...query, page: n })

  return (
    <nav aria-label={t('label')} className={css.nav}>
      <ul className={css.list}>
        {page > 1 && (
          <li>
            <Link href={hrefFor(page - 1)} rel="prev" className={css.link}>
              {t('previous')}
            </Link>
          </li>
        )}
        {visiblePages(page, pageCount).map((n, index) =>
          n === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className={css.gap}>
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                href={hrefFor(n)}
                aria-label={t('page', { page: n })}
                aria-current={n === page ? 'page' : undefined}
                className={n === page ? css.current : css.link}
              >
                {n}
              </Link>
            </li>
          ),
        )}
        {page < pageCount && (
          <li>
            <Link href={hrefFor(page + 1)} rel="next" className={css.link}>
              {t('next')}
            </Link>
          </li>
        )}
      </ul>
    </nav>
  )
}
