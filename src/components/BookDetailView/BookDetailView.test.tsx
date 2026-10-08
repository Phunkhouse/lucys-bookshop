import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { BookDetail } from '@/server/catalog'
import { BookDetailView } from './BookDetailView'

const book: BookDetail = {
  shortId: 'abc12345',
  title: 'Stíny nad Vltavou',
  author: 'Marta Hrubešová',
  isbn: '9780000000019',
  description: 'Detektivní příběh z podzimní Prahy.',
  conditionNote: 'Obálka mírně obroušená.',
  priceMinor: 18900,
  currency: 'CZK',
  condition: 'used',
  language: 'cs',
  status: 'available',
  soldAt: null,
  genres: ['crime', 'novel'],
  images: [],
}

describe('BookDetailView', () => {
  it('shows the title as the page heading, with author and price', () => {
    renderWithIntl(<BookDetailView book={book} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Stíny nad Vltavou' }),
    ).toBeDefined()
    expect(screen.getByText('Marta Hrubešová')).toBeDefined()
    expect(screen.getByText(/^189\s*Kč$/)).toBeDefined()
  })

  it('lists condition with its note, language, genres and ISBN', () => {
    renderWithIntl(<BookDetailView book={book} />)
    expect(screen.getByText('Použitá – Obálka mírně obroušená.')).toBeDefined()
    expect(screen.getByText('čeština')).toBeDefined()
    expect(screen.getByText('Detektivka, Román')).toBeDefined()
    expect(screen.getByText('9780000000019')).toBeDefined()
    expect(
      screen.getByText('Detektivní příběh z podzimní Prahy.'),
    ).toBeDefined()
  })

  it('leaves out ISBN, genres, note and description when the book has none', () => {
    renderWithIntl(
      <BookDetailView
        book={{
          ...book,
          isbn: null,
          genres: [],
          conditionNote: null,
          description: '',
        }}
      />,
    )
    expect(screen.queryByText('ISBN')).toBeNull()
    expect(screen.queryByText('Žánry')).toBeNull()
    expect(screen.getByText('Použitá')).toBeDefined()
  })

  it('has a link back to the catalog', () => {
    renderWithIntl(<BookDetailView book={book} />)
    const link = screen.getByRole('link', { name: 'Zpět na knihy' })
    expect(link.getAttribute('href')).toBe('/')
  })

  it('shows a disabled add-to-cart button with a message for an available book', () => {
    renderWithIntl(<BookDetailView book={book} />)
    const button = screen.getByRole('button', { name: 'Přidat do košíku' })
    expect(button).toHaveProperty('disabled', true)
    expect(screen.getByText('Košík bude brzy k dispozici.')).toBeDefined()
    expect(screen.queryByText('Rezervováno')).toBeNull()
  })

  it('explains that a reserved book is taken, with the badge', () => {
    renderWithIntl(<BookDetailView book={{ ...book, status: 'reserved' }} />)
    expect(screen.getByText('Rezervováno')).toBeDefined()
    expect(
      screen.getByText('Tato kniha je právě rezervovaná pro jiného zákazníka.'),
    ).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'Přidat do košíku' }),
    ).toHaveProperty('disabled', true)
  })

  it('shows a sold notice with the sold date', () => {
    renderWithIntl(
      <BookDetailView
        book={{
          ...book,
          status: 'sold',
          soldAt: new Date('2026-10-03T10:00:00.000Z'),
        }}
      />,
    )
    expect(screen.getByText('Prodáno')).toBeDefined()
    expect(
      screen.getByText('Tato kniha už byla prodána 3. října 2026.'),
    ).toBeDefined()
  })
})
