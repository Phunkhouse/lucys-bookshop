import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CART_STORAGE_KEY } from '@/lib/cart-store'
import { renderWithIntl } from '@/lib/render-with-intl'
import { CartLink } from './CartLink'

beforeEach(() => localStorage.clear())

function fill(count: number) {
  const items = Array.from({ length: count }, (_, i) => ({
    shortId: `b${String(i).padStart(7, '0')}`,
    priceMinorSeen: 1,
  }))
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ v: 1, items }))
}

describe('CartLink', () => {
  it('is a plain link to the cart when it is empty', () => {
    renderWithIntl(<CartLink />)
    const link = screen.getByRole('link', { name: 'Košík' })
    expect(link.getAttribute('href')).toBe('/cart')
    expect(link.textContent).toBe('Košík')
  })

  it.each([
    [1, 'Košík: 1 kniha'],
    [2, 'Košík: 2 knihy'],
    [5, 'Košík: 5 knih'],
  ])('shows %s in the cart and names it in Czech plural', (count, name) => {
    fill(count)
    renderWithIntl(<CartLink />)
    const link = screen.getByRole('link', { name })
    expect(link.textContent).toBe(`Košík (${count})`)
  })
})
