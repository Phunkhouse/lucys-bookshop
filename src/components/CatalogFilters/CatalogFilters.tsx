import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { CatalogQuery } from '@/server/catalog-query'
import { defaultCatalogQuery } from '@/server/catalog-query'
import css from './CatalogFilters.module.scss'

const SORTS = ['newest', 'price-asc', 'price-desc', 'title', 'author'] as const
const CONDITIONS = ['like_new', 'used'] as const

type CatalogFiltersProps = {
  query: CatalogQuery
  // What the shop has: only these genres and languages are offered.
  options: { genres: string[]; languages: string[] }
}

const crowns = (minor: number | undefined) =>
  minor === undefined ? '' : String(minor / 100)

// A plain GET form: it works without JavaScript, and the URL it builds is the
// one the page reads (ADR 0022). It has no action, so it submits to the page it
// is on. A new search starts on page 1 because the form never sends a page.
export function CatalogFilters({ query, options }: CatalogFiltersProps) {
  const t = useTranslations('Catalog')
  const tGenres = useTranslations('Genres')
  const tBook = useTranslations('Book')
  const locale = useLocale()

  const languageNames = new Intl.DisplayNames(locale, { type: 'language' })
  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, locale)
  const genres = options.genres
    .map((key) => ({ value: key, label: tGenres(key) }))
    .sort(byLabel)
  const languages = options.languages
    .map((code) => ({ value: code, label: languageNames.of(code) ?? code }))
    .sort(byLabel)

  const activeFilters =
    query.genres.length +
    query.conditions.length +
    query.languages.length +
    (query.minPriceMinor !== undefined ? 1 : 0) +
    (query.maxPriceMinor !== undefined ? 1 : 0) +
    (query.onlyAvailable ? 1 : 0)
  const canReset =
    activeFilters > 0 ||
    query.q !== undefined ||
    query.sort !== defaultCatalogQuery.sort

  return (
    <form role="search" className={css.form}>
      <div className={css.field}>
        <label htmlFor="catalog-q">{t('search.label')}</label>
        <input
          id="catalog-q"
          type="search"
          name="q"
          defaultValue={query.q ?? ''}
          maxLength={100}
          autoComplete="off"
        />
      </div>

      <div className={css.field}>
        <label htmlFor="catalog-sort">{t('sort.label')}</label>
        <select id="catalog-sort" name="sort" defaultValue={query.sort}>
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`sort.${sort}`)}
            </option>
          ))}
        </select>
      </div>

      <details className={css.filters} open={activeFilters > 0}>
        <summary>
          {activeFilters > 0
            ? t('filters.toggleActive', { count: activeFilters })
            : t('filters.toggle')}
        </summary>

        <div className={css.groups}>
          {genres.length > 0 && (
            <Choices
              legend={t('filters.genre')}
              name="genre"
              options={genres}
              selected={query.genres}
            />
          )}
          <Choices
            legend={t('filters.condition')}
            name="condition"
            options={CONDITIONS.map((value) => ({
              value,
              label: tBook(`condition.${value}`),
            }))}
            selected={query.conditions}
          />
          {languages.length > 1 && (
            <Choices
              legend={t('filters.language')}
              name="lang"
              options={languages}
              selected={query.languages}
            />
          )}

          <fieldset className={css.group}>
            <legend>{t('filters.price')}</legend>
            <div className={css.field}>
              <label htmlFor="catalog-min">{t('filters.priceMin')}</label>
              <input
                id="catalog-min"
                type="number"
                name="min"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={crowns(query.minPriceMinor)}
              />
            </div>
            <div className={css.field}>
              <label htmlFor="catalog-max">{t('filters.priceMax')}</label>
              <input
                id="catalog-max"
                type="number"
                name="max"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={crowns(query.maxPriceMinor)}
              />
            </div>
          </fieldset>

          <label className={css.choice}>
            <input
              type="checkbox"
              name="available"
              value="1"
              defaultChecked={query.onlyAvailable}
            />
            {t('filters.available')}
          </label>
        </div>
      </details>

      <div className={css.actions}>
        <button type="submit" className={css.submit}>
          {t('filters.apply')}
        </button>
        {canReset && (
          <Link href="/" className={css.reset}>
            {t('filters.reset')}
          </Link>
        )}
      </div>
    </form>
  )
}

type ChoicesProps = {
  legend: string
  name: string
  options: { value: string; label: string }[]
  selected: string[]
}

function Choices({ legend, name, options, selected }: ChoicesProps) {
  return (
    <fieldset className={css.group}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={css.choice}>
          <input
            type="checkbox"
            name={name}
            value={option.value}
            defaultChecked={selected.includes(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  )
}
