import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { BookDetail } from '@/server/catalog'
import { BookDetailView } from './BookDetailView'

const BASE = 'https://pub-abc.r2.dev'

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
    renderWithIntl(<BookDetailView book={book} imageBaseUrl={BASE} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Stíny nad Vltavou' }),
    ).toBeDefined()
    expect(screen.getByText('Marta Hrubešová')).toBeDefined()
    expect(screen.getByText(/^189\s*Kč$/)).toBeDefined()
  })

  it('lists condition with its note, language, genres and ISBN', () => {
    renderWithIntl(<BookDetailView book={book} imageBaseUrl={BASE} />)
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
        imageBaseUrl={BASE}
      />,
    )
    expect(screen.queryByText('ISBN')).toBeNull()
    expect(screen.queryByText('Žánry')).toBeNull()
    expect(screen.getByText('Použitá')).toBeDefined()
  })

  it('has a link back to the catalog', () => {
    renderWithIntl(<BookDetailView book={book} imageBaseUrl={BASE} />)
    const link = screen.getByRole('link', { name: 'Zpět na knihy' })
    expect(link.getAttribute('href')).toBe('/')
  })

  it('shows a disabled add-to-cart button with a message for an available book', () => {
    renderWithIntl(<BookDetailView book={book} imageBaseUrl={BASE} />)
    const button = screen.getByRole('button', { name: 'Přidat do košíku' })
    expect(button).toHaveProperty('disabled', true)
    expect(screen.getByText('Košík bude brzy k dispozici.')).toBeDefined()
    expect(screen.queryByText('Rezervováno')).toBeNull()
  })

  it('explains that a reserved book is taken, with the badge', () => {
    renderWithIntl(
      <BookDetailView
        book={{ ...book, status: 'reserved' }}
        imageBaseUrl={BASE}
      />,
    )
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
        imageBaseUrl={BASE}
      />,
    )
    expect(screen.getByText('Prodáno')).toBeDefined()
    expect(
      screen.getByText('Tato kniha už byla prodána 3. října 2026.'),
    ).toBeDefined()
  })

  describe('photos', () => {
    const photos = [
      { baseKey: 'books/b1/i1', width: 1200, height: 1600 },
      { baseKey: 'books/b1/i2', width: 1200, height: 1600 },
      { baseKey: 'books/b1/i3', width: 1600, height: 1200 },
    ]
    const render = (images = photos) =>
      renderWithIntl(
        <BookDetailView book={{ ...book, images }} imageBaseUrl={BASE} />,
      )

    it('shows several photos as a list, each described by the title and its place', () => {
      render()

      const list = screen.getByRole('list', { name: 'Fotky knihy' })
      const items = within(list).getAllByRole('listitem')
      expect(items).toHaveLength(3)
      expect(
        items.map((item) => item.querySelector('img')?.getAttribute('alt')),
      ).toEqual([
        'Stíny nad Vltavou – fotka 1 z 3',
        'Stíny nad Vltavou – fotka 2 z 3',
        'Stíny nad Vltavou – fotka 3 z 3',
      ])
      expect(screen.getByText('Fotka 2 z 3')).toBeTruthy()
      expect(screen.queryByText('Fotografie brzy')).toBeNull()
    })

    it('can be scrolled with the keyboard when there are several', () => {
      render()

      expect(
        screen
          .getByRole('list', { name: 'Fotky knihy' })
          .getAttribute('tabindex'),
      ).toBe('0')
    })

    it('shows one photo with just the title as its description, no caption and nothing to scroll', () => {
      const { container } = render([photos[0]])

      expect(container.querySelector('img')?.getAttribute('alt')).toBe(
        'Stíny nad Vltavou',
      )
      expect(screen.queryByText(/^Fotka 1 z 1$/)).toBeNull()
      expect(
        screen
          .getByRole('list', { name: 'Fotky knihy' })
          .hasAttribute('tabindex'),
      ).toBe(false)
    })

    it('loads the first photo at once with high priority, and the others lazily', () => {
      const { container } = render()

      const images = [...container.querySelectorAll('img')]
      expect(images.map((i) => i.getAttribute('loading'))).toEqual([
        'eager',
        'lazy',
        'lazy',
      ])
      expect(images[0].getAttribute('fetchpriority')).toBe('high')
      expect(images[1].hasAttribute('fetchpriority')).toBe(false)
    })

    it('keeps the placeholder, and no list, for a book without photos', () => {
      const { container } = render([])

      expect(screen.getByText('Fotografie brzy')).toBeTruthy()
      expect(screen.queryByRole('list', { name: 'Fotky knihy' })).toBeNull()
      expect(container.querySelector('img')).toBeNull()
    })
  })
})
