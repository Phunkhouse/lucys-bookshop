import { z } from 'zod'

// The catalog's whole state lives in the URL (decision note 0022). Parsing is
// lenient on purpose: every field falls back to its default on its own, so a
// hand-edited or outdated link still renders a page, never an error.

export const CATALOG_PAGE_SIZE = 24

const CATALOG_SORTS = [
  'newest',
  'price-asc',
  'price-desc',
  'title',
  'author',
] as const
export type CatalogSort = (typeof CATALOG_SORTS)[number]

type Condition = 'like_new' | 'used'

export type CatalogQuery = {
  q: string | undefined
  genres: string[]
  conditions: Condition[]
  languages: string[]
  minPriceMinor: number | undefined
  maxPriceMinor: number | undefined
  onlyAvailable: boolean
  sort: CatalogSort
  page: number
}

export const defaultCatalogQuery: CatalogQuery = {
  q: undefined,
  genres: [],
  conditions: [],
  languages: [],
  minPriceMinor: undefined,
  maxPriceMinor: undefined,
  onlyAvailable: false,
  sort: 'newest',
  page: 1,
}

// What Next.js gives for `searchParams`.
type RawParams = Record<string, string | string[] | undefined>

const MAX_SEARCH_LENGTH = 100
const MAX_GENRES = 10
const MAX_PRICE_CZK = 1_000_000
const MAX_PAGE = 10_000

const genreKey = z.string().regex(/^[a-z0-9_-]{1,40}$/)
const languageCode = z.string().regex(/^[a-z]{2}$/)
const condition = z.enum(['like_new', 'used'])
const sort = z.enum(CATALOG_SORTS)
const wholeNumber = z.string().regex(/^\d+$/)

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const all = (value: string | string[] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

// Valid values only, without duplicates, sorted so one query has one URL.
function validList<T extends string>(
  schema: z.ZodType<T>,
  value: string | string[] | undefined,
): T[] {
  const valid = all(value).filter((v) => schema.safeParse(v).success) as T[]
  return [...new Set(valid)].sort()
}

function crownsToMinor(value: string | string[] | undefined) {
  const text = first(value)
  if (text === undefined || !wholeNumber.safeParse(text).success) {
    return undefined
  }
  const crowns = Number(text)
  return crowns <= MAX_PRICE_CZK ? crowns * 100 : undefined
}

export function parseCatalogQuery(params: RawParams): CatalogQuery {
  const text = (first(params.q) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SEARCH_LENGTH)
    .trim()

  let min = crownsToMinor(params.min)
  let max = crownsToMinor(params.max)
  if (min !== undefined && max !== undefined && min > max) {
    ;[min, max] = [max, min]
  }

  const pageText = first(params.page)
  const page =
    pageText !== undefined && wholeNumber.safeParse(pageText).success
      ? Number(pageText)
      : 1

  return {
    q: text === '' ? undefined : text,
    genres: validList(genreKey, params.genre).slice(0, MAX_GENRES),
    conditions: validList(condition, params.condition),
    languages: validList(languageCode, params.lang),
    minPriceMinor: min,
    maxPriceMinor: max,
    onlyAvailable: first(params.available) === '1',
    sort: sort.catch('newest').parse(first(params.sort)),
    page: page >= 1 && page <= MAX_PAGE ? page : 1,
  }
}

// The query string for a query (no leading "?"). Defaults are left out, so the
// default catalog is the plain path.
export function serializeCatalogQuery(query: CatalogQuery): string {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  for (const genre of query.genres) params.append('genre', genre)
  for (const value of query.conditions) params.append('condition', value)
  for (const lang of query.languages) params.append('lang', lang)
  if (query.minPriceMinor !== undefined) {
    params.set('min', String(query.minPriceMinor / 100))
  }
  if (query.maxPriceMinor !== undefined) {
    params.set('max', String(query.maxPriceMinor / 100))
  }
  if (query.onlyAvailable) params.set('available', '1')
  if (query.sort !== defaultCatalogQuery.sort) params.set('sort', query.sort)
  if (query.page !== defaultCatalogQuery.page) {
    params.set('page', String(query.page))
  }
  return params.toString()
}
