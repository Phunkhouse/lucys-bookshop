import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { defaultCatalogQuery, type CatalogQuery } from '@/server/catalog-query'
import { CatalogFilters } from './CatalogFilters'

const options = { genres: ['scifi', 'crime', 'novel'], languages: ['en', 'cs'] }

const render = (query: Partial<CatalogQuery> = {}) =>
  renderWithIntl(
    <CatalogFilters
      query={{ ...defaultCatalogQuery, ...query }}
      options={options}
    />,
  )

describe('CatalogFilters', () => {
  it('is a search form with no action and the GET method', () => {
    render()
    const form = screen.getByRole('search')
    expect(form.tagName).toBe('FORM')
    expect(form.getAttribute('action')).toBeNull()
    expect((form as HTMLFormElement).method).toBe('get')
  })

  it('has a labelled search box holding the current text', () => {
    render({ q: 'čapek' })
    const box = screen.getByLabelText(
      'Hledat podle názvu, autora nebo ISBN',
    ) as HTMLInputElement
    expect(box.name).toBe('q')
    expect(box.value).toBe('čapek')
  })

  it('has a labelled sort with the five sorts and the current one chosen', () => {
    render({ sort: 'price-desc' })
    const select = screen.getByLabelText('Řadit podle') as HTMLSelectElement
    expect(select.name).toBe('sort')
    expect(select.value).toBe('price-desc')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value),
    ).toEqual(['newest', 'price-asc', 'price-desc', 'title', 'author'])
  })

  it('offers the genres of the shop, sorted by their Czech label', () => {
    render()
    const group = screen.getByRole('group', { name: 'Žánr' })
    expect(
      within(group)
        .getAllByRole('checkbox')
        .map((c) => (c as HTMLInputElement).value),
    ).toEqual(['crime', 'novel', 'scifi'])
    // Detektivka, Román, Sci-fi
    expect(within(group).getByLabelText('Detektivka')).toBeDefined()
  })

  it('ticks the chosen genres, conditions and languages', () => {
    render({ genres: ['crime'], conditions: ['like_new'], languages: ['en'] })
    const checked = (name: string) =>
      (screen.getByLabelText(name) as HTMLInputElement).checked
    expect(checked('Detektivka')).toBe(true)
    expect(checked('Sci-fi')).toBe(false)
    expect(checked('Jako nová')).toBe(true)
    expect(checked('Použitá')).toBe(false)
    expect(checked('angličtina')).toBe(true)
    expect(checked('čeština')).toBe(false)
  })

  it('names languages in Czech and sorts them by that name', () => {
    render()
    const group = screen.getByRole('group', { name: 'Jazyk' })
    // angličtina, čeština
    expect(
      within(group)
        .getAllByRole('checkbox')
        .map((c) => (c as HTMLInputElement).value),
    ).toEqual(['en', 'cs'])
  })

  it('leaves out the language group when the shop has one language only', () => {
    renderWithIntl(
      <CatalogFilters
        query={defaultCatalogQuery}
        options={{ genres: [], languages: ['cs'] }}
      />,
    )
    expect(screen.queryByRole('group', { name: 'Jazyk' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Žánr' })).toBeNull()
  })

  it('shows prices in whole crowns, from the minor units of the query', () => {
    render({ minPriceMinor: 5000, maxPriceMinor: 15000 })
    expect(
      (screen.getByLabelText('Cena od (Kč)') as HTMLInputElement).value,
    ).toBe('50')
    expect(
      (screen.getByLabelText('Cena do (Kč)') as HTMLInputElement).value,
    ).toBe('150')
  })

  it('has the availability checkbox named available with value 1', () => {
    render({ onlyAvailable: true })
    const box = screen.getByLabelText('Jen dostupné knihy') as HTMLInputElement
    expect(box.name).toBe('available')
    expect(box.value).toBe('1')
    expect(box.checked).toBe(true)
  })

  it('keeps the filters closed when none is set, and open when one is', () => {
    const { container, unmount } = render()
    expect(container.querySelector('details')!.open).toBe(false)
    expect(screen.getByText('Filtry')).toBeDefined()
    unmount()

    const second = render({ genres: ['crime'], onlyAvailable: true })
    expect(second.container.querySelector('details')!.open).toBe(true)
    expect(screen.getByText('Filtry (2)')).toBeDefined()
  })

  it('has a submit button and no reset link while nothing is set', () => {
    render()
    expect(screen.getByRole('button', { name: 'Zobrazit' })).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Zrušit filtry' })).toBeNull()
  })

  it.each([
    ['a search', { q: 'x' }],
    ['a filter', { onlyAvailable: true }],
    ['a sort', { sort: 'title' as const }],
  ])('offers a reset link back to the whole catalog for %s', (_, query) => {
    render(query)
    expect(
      screen.getByRole('link', { name: 'Zrušit filtry' }).getAttribute('href'),
    ).toBe('/')
  })

  it('does not send a page, so a new search starts on page 1', () => {
    render({ page: 4 })
    const names = [...document.querySelectorAll('form [name]')].map(
      (e) => (e as HTMLInputElement).name,
    )
    expect(names).not.toContain('page')
  })
})
