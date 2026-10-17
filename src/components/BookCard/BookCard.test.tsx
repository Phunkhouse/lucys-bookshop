import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { CatalogItem } from '@/server/catalog'
import { BookCard } from './BookCard'

const BASE = 'https://pub-abc.r2.dev'

const book: CatalogItem = {
  shortId: 'abc12345',
  title: 'Stíny nad Vltavou',
  author: 'Marta Hrubešová',
  priceMinor: 18900,
  currency: 'CZK',
  condition: 'used',
  language: 'cs',
  status: 'available',
  genres: ['crime', 'novel'],
  cover: null,
}

describe('BookCard', () => {
  it('links the title to the canonical book URL', () => {
    renderWithIntl(<BookCard book={book} imageBaseUrl={BASE} />)
    const link = screen.getByRole('link', { name: 'Stíny nad Vltavou' })
    expect(link.getAttribute('href')).toBe('/books/abc12345/stiny-nad-vltavou')
  })

  it('shows the title as a heading, with author, condition and genres', () => {
    renderWithIntl(<BookCard book={book} imageBaseUrl={BASE} />)
    expect(
      screen.getByRole('heading', { name: 'Stíny nad Vltavou' }),
    ).toBeDefined()
    expect(screen.getByText('Marta Hrubešová')).toBeDefined()
    expect(screen.getByText('Použitá · Detektivka · Román')).toBeDefined()
  })

  it('formats the price in Czech crowns from minor units', () => {
    renderWithIntl(<BookCard book={book} imageBaseUrl={BASE} />)
    // Intl puts a non-breaking space before the currency sign.
    const price = screen.getByText(/^189\s*Kč$/)
    expect(price).toBeDefined()
  })

  it('keeps haléře when the price has them', () => {
    renderWithIntl(
      <BookCard book={{ ...book, priceMinor: 18950 }} imageBaseUrl={BASE} />,
    )
    expect(screen.getByText(/^189,50\s*Kč$/)).toBeDefined()
  })

  it('shows a placeholder where the photo will be', () => {
    renderWithIntl(<BookCard book={book} imageBaseUrl={BASE} />)
    expect(screen.getByText('Fotografie brzy')).toBeDefined()
  })

  it('shows no badge for an available book', () => {
    renderWithIntl(<BookCard book={book} imageBaseUrl={BASE} />)
    expect(screen.queryByText('Rezervováno')).toBeNull()
    expect(screen.queryByText('Prodáno')).toBeNull()
  })

  it('shows the Rezervováno badge for a reserved book', () => {
    renderWithIntl(
      <BookCard book={{ ...book, status: 'reserved' }} imageBaseUrl={BASE} />,
    )
    expect(screen.getByText('Rezervováno')).toBeDefined()
  })

  it('shows the Prodáno badge for a sold book', () => {
    renderWithIntl(
      <BookCard book={{ ...book, status: 'sold' }} imageBaseUrl={BASE} />,
    )
    expect(screen.getByText('Prodáno')).toBeDefined()
  })

  it('copes with a book without genres', () => {
    renderWithIntl(
      <BookCard book={{ ...book, genres: [] }} imageBaseUrl={BASE} />,
    )
    expect(screen.getByText('Použitá')).toBeDefined()
  })

  describe('cover photo', () => {
    const cover = { baseKey: 'books/b1/i1', width: 1200, height: 1600 }
    const coverImage = (
      props: Partial<Parameters<typeof BookCard>[0]> = {},
    ) => {
      const { container } = renderWithIntl(
        <BookCard book={{ ...book, cover }} imageBaseUrl={BASE} {...props} />,
      )
      return container.querySelector('img')
    }

    it('shows the cover instead of the placeholder', () => {
      const img = coverImage()

      expect(img?.getAttribute('srcset')).toContain(
        `${BASE}/books/b1/i1/thumb.jpg 360w`,
      )
      expect(screen.queryByText('Fotografie brzy')).toBeNull()
    })

    it('leaves the cover without a description, because the title link already names the book', () => {
      const img = coverImage()

      expect(img?.hasAttribute('alt')).toBe(true)
      expect(img?.getAttribute('alt')).toBe('')
    })

    it('loads the cover lazily unless the card is among the first', () => {
      expect(coverImage()?.getAttribute('loading')).toBe('lazy')
    })

    it('loads the cover at once for a card marked as important', () => {
      const img = coverImage({ priority: true })

      expect(img?.getAttribute('loading')).toBe('eager')
    })
  })

  it('still shows the placeholder, and no picture, for a book without a cover', () => {
    const { container } = renderWithIntl(
      <BookCard book={book} imageBaseUrl={BASE} />,
    )

    expect(screen.getByText('Fotografie brzy')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })
})
