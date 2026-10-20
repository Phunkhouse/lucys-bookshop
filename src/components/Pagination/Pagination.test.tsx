import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { defaultCatalogQuery } from '@/server/catalog-query'
import { Pagination } from './Pagination'

const hrefOf = (name: string) =>
  screen.getByRole('link', { name }).getAttribute('href')

describe('Pagination', () => {
  it('renders nothing for a single page', () => {
    const { container } = renderWithIntl(
      <Pagination query={defaultCatalogQuery} page={1} pageCount={1} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('is a labelled navigation', () => {
    renderWithIntl(
      <Pagination query={defaultCatalogQuery} page={1} pageCount={3} />,
    )
    expect(
      screen.getByRole('navigation', { name: 'Stránkování' }),
    ).toBeDefined()
  })

  it('marks the current page and links the others', () => {
    renderWithIntl(
      <Pagination query={defaultCatalogQuery} page={2} pageCount={3} />,
    )
    expect(
      screen
        .getByRole('link', { name: 'Stránka 2' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen
        .getByRole('link', { name: 'Stránka 3' })
        .getAttribute('aria-current'),
    ).toBeNull()
  })

  it('links page 1 to the plain catalog and later pages to ?page=', () => {
    renderWithIntl(
      <Pagination query={defaultCatalogQuery} page={2} pageCount={3} />,
    )
    expect(hrefOf('Stránka 1')).toBe('/')
    expect(hrefOf('Stránka 3')).toBe('/?page=3')
  })

  it('keeps search, filters and sort in every link', () => {
    renderWithIntl(
      <Pagination
        query={{
          ...defaultCatalogQuery,
          q: 'čapek',
          genres: ['crime'],
          sort: 'title',
        }}
        page={1}
        pageCount={2}
      />,
    )
    const params = new URLSearchParams(hrefOf('Stránka 2')!.split('?')[1])
    expect(params.get('q')).toBe('čapek')
    expect(params.getAll('genre')).toEqual(['crime'])
    expect(params.get('sort')).toBe('title')
    expect(params.get('page')).toBe('2')
  })

  it('offers previous and next only where they lead somewhere', () => {
    const { unmount } = renderWithIntl(
      <Pagination query={defaultCatalogQuery} page={1} pageCount={3} />,
    )
    expect(screen.queryByRole('link', { name: 'Předchozí' })).toBeNull()
    expect(hrefOf('Další')).toBe('/?page=2')
    unmount()

    renderWithIntl(
      <Pagination query={defaultCatalogQuery} page={3} pageCount={3} />,
    )
    expect(hrefOf('Předchozí')).toBe('/?page=2')
    expect(screen.queryByRole('link', { name: 'Další' })).toBeNull()
  })

  it('marks a gap where pages are left out, and none where they are all shown', () => {
    const { unmount } = renderWithIntl(
      <Pagination query={defaultCatalogQuery} page={1} pageCount={5} />,
    )
    expect(screen.getAllByText('…')).toHaveLength(1)
    unmount()

    renderWithIntl(
      <Pagination query={defaultCatalogQuery} page={3} pageCount={5} />,
    )
    expect(screen.queryByText('…')).toBeNull()
  })

  it('shortens a long range to the ends, the current page and its neighbours', () => {
    renderWithIntl(
      <Pagination query={defaultCatalogQuery} page={10} pageCount={20} />,
    )
    const links = within(
      screen.getByRole('navigation', { name: 'Stránkování' }),
    ).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([
      'Předchozí',
      '1',
      '9',
      '10',
      '11',
      '20',
      'Další',
    ])
  })
})
