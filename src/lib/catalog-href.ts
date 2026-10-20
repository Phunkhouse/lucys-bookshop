import {
  serializeCatalogQuery,
  type CatalogQuery,
} from '@/server/catalog-query'

// Link to the catalog for a query: the plain path for the default query.
export function catalogHref(query: CatalogQuery): string {
  const qs = serializeCatalogQuery(query)
  return qs === '' ? '/' : `/?${qs}`
}
