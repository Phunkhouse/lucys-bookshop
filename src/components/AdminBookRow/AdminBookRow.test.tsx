import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { AdminBookItem } from '@/server/admin/book-list'
import { AdminBookRow } from './AdminBookRow'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const now = new Date('2026-10-09T12:00:00.000Z')

const book: AdminBookItem = {
  id: '5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50',
  shortId: 'abc12345',
  title: 'Stíny nad Vltavou',
  author: 'Marta Hrubešová',
  priceMinor: 18900,
  currency: 'CZK',
  status: 'available',
  updatedAt: new Date('2026-10-04T12:00:00.000Z'),
  photoCount: 2,
}

const render = (overrides: Partial<AdminBookItem> = {}) =>
  renderWithIntl(
    <AdminBookRow
      book={{ ...book, ...overrides }}
      now={now}
      setHidden={vi.fn()}
    />,
  )

describe('AdminBookRow', () => {
  it('shows title as a heading, author, price, status and last change', () => {
    render()

    expect(
      screen.getByRole('heading', { name: 'Stíny nad Vltavou' }),
    ).toBeTruthy()
    expect(screen.getByText('Marta Hrubešová')).toBeTruthy()
    expect(screen.getByText(/189\s*Kč/)).toBeTruthy()
    expect(screen.getByText('Dostupná')).toBeTruthy()
    expect(screen.getByText('Změněno před 5 dny')).toBeTruthy()
  })

  it('flags a book without photos', () => {
    render({ photoCount: 0 })

    expect(screen.getByText('Bez fotek')).toBeTruthy()
  })

  it('does not flag a book that has photos', () => {
    render({ photoCount: 1 })

    expect(screen.queryByText('Bez fotek')).toBeNull()
  })

  it.each([
    ['reserved', 'Rezervovaná'],
    ['sold', 'Prodaná'],
    ['hidden', 'Skrytá'],
  ] as const)('shows the %s status in words', (status, label) => {
    render({ status })

    expect(screen.getByText(label)).toBeTruthy()
  })

  it('offers the hide button only where it applies', () => {
    const { unmount } = render({ status: 'available' })
    expect(screen.getByRole('button', { name: 'Skrýt' })).toBeTruthy()
    unmount()

    render({ status: 'sold' })
    expect(screen.queryByRole('button')).toBeNull()
  })
})
