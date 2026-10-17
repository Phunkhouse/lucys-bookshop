import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { BookDetail } from '@/server/catalog'
import { BookDetailView } from './BookDetailView'

// The carousel needs a real browser; here it never starts, which is enough to
// see what the page puts into it.
vi.mock('embla-carousel-react', () => ({
  default: () => [() => {}, undefined],
}))

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

    it('shows several photos in a carousel, each described by the title and its place', () => {
      render()

      const region = screen.getByRole('region', { name: 'Fotky knihy' })
      const slides = within(region).getAllByRole('group', {
        name: /^Fotka \d z 3$/,
      })
      expect(slides).toHaveLength(3)
      expect(
        slides.map((slide) =>
          within(slide).getByRole('img').getAttribute('alt'),
        ),
      ).toEqual([
        'Stíny nad Vltavou – fotka 1 z 3',
        'Stíny nad Vltavou – fotka 2 z 3',
        'Stíny nad Vltavou – fotka 3 z 3',
      ])
      expect(screen.queryByText('Fotografie brzy')).toBeNull()
    })

    it('keeps the counter outside the photos, and moves nothing with them', () => {
      render()

      // One counter, in the controls below the photos.
      expect(screen.getAllByText('Fotka 1 z 3')).toHaveLength(1)
      expect(screen.queryByText('Fotka 2 z 3')).toBeNull()
      expect(screen.getByRole('button', { name: 'Další fotka' })).toBeTruthy()
    })

    it('shows one photo with just the title as its description and nothing to page through', () => {
      const { container } = render([photos[0]])

      expect(container.querySelector('img')?.getAttribute('alt')).toBe(
        'Stíny nad Vltavou',
      )
      expect(screen.queryByRole('region', { name: 'Fotky knihy' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Další fotka' })).toBeNull()
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

    it('keeps the placeholder, and no carousel, for a book without photos', () => {
      const { container } = render([])

      expect(screen.getByText('Fotografie brzy')).toBeTruthy()
      expect(screen.queryByRole('region', { name: 'Fotky knihy' })).toBeNull()
      expect(container.querySelector('img')).toBeNull()
    })
  })
})
