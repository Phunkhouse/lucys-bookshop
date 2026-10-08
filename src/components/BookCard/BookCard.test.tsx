import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { CatalogItem } from '@/server/catalog'
import { BookCard } from './BookCard'

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
    renderWithIntl(<BookCard book={book} />)
    const link = screen.getByRole('link', { name: 'Stíny nad Vltavou' })
    expect(link.getAttribute('href')).toBe('/books/abc12345/stiny-nad-vltavou')
  })

  it('shows the title as a heading, with author, condition and genres', () => {
    renderWithIntl(<BookCard book={book} />)
    expect(
      screen.getByRole('heading', { name: 'Stíny nad Vltavou' }),
    ).toBeDefined()
    expect(screen.getByText('Marta Hrubešová')).toBeDefined()
    expect(screen.getByText('Použitá · Detektivka · Román')).toBeDefined()
  })

  it('formats the price in Czech crowns from minor units', () => {
    renderWithIntl(<BookCard book={book} />)
    // Intl puts a non-breaking space before the currency sign.
    const price = screen.getByText(/^189\s*Kč$/)
    expect(price).toBeDefined()
  })

  it('keeps haléře when the price has them', () => {
    renderWithIntl(<BookCard book={{ ...book, priceMinor: 18950 }} />)
    expect(screen.getByText(/^189,50\s*Kč$/)).toBeDefined()
  })

  it('shows a placeholder where the photo will be', () => {
    renderWithIntl(<BookCard book={book} />)
    expect(screen.getByText('Fotografie brzy')).toBeDefined()
  })

  it('shows no badge for an available book', () => {
    renderWithIntl(<BookCard book={book} />)
    expect(screen.queryByText('Rezervováno')).toBeNull()
    expect(screen.queryByText('Prodáno')).toBeNull()
  })

  it('shows the Rezervováno badge for a reserved book', () => {
    renderWithIntl(<BookCard book={{ ...book, status: 'reserved' }} />)
    expect(screen.getByText('Rezervováno')).toBeDefined()
  })

  it('shows the Prodáno badge for a sold book', () => {
    renderWithIntl(<BookCard book={{ ...book, status: 'sold' }} />)
    expect(screen.getByText('Prodáno')).toBeDefined()
  })

  it('copes with a book without genres', () => {
    renderWithIntl(<BookCard book={{ ...book, genres: [] }} />)
    expect(screen.getByText('Použitá')).toBeDefined()
  })
})
