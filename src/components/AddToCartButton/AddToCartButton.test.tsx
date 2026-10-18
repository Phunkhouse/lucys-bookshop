import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_CART_ITEMS } from '@/lib/cart-schema'
import { CART_STORAGE_KEY } from '@/lib/cart-store'
import { renderWithIntl } from '@/lib/render-with-intl'
import { AddToCartButton } from './AddToCartButton'

beforeEach(() => localStorage.clear())

const storedItems = () =>
  JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '{"items":[]}').items

function renderButton(
  props: Partial<React.ComponentProps<typeof AddToCartButton>> = {},
) {
  return renderWithIntl(
    <AddToCartButton
      shortId="abc12345"
      priceMinor={18900}
      status="available"
      soldDate="3. října 2026"
      {...props}
    />,
  )
}

describe('AddToCartButton', () => {
  it('adds the book with the price the buyer saw, and says so', async () => {
    renderButton()

    fireEvent.click(screen.getByRole('button', { name: 'Přidat do košíku' }))

    expect(storedItems()).toEqual([
      { shortId: 'abc12345', priceMinorSeen: 18900 },
    ])
    expect(screen.getByRole('status').textContent).toContain(
      'Kniha je v košíku.',
    )
    expect(
      screen.getByRole('link', { name: 'Zobrazit košík' }).getAttribute('href'),
    ).toBe('/cart')
  })

  it('takes the book out again', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Přidat do košíku' }))

    fireEvent.click(screen.getByRole('button', { name: 'Odebrat z košíku' }))

    expect(storedItems()).toEqual([])
    expect(
      screen.getByRole('button', { name: 'Přidat do košíku' }),
    ).toBeDefined()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('shows a book that is already in the cart as such', () => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        items: [{ shortId: 'abc12345', priceMinorSeen: 18900 }],
      }),
    )
    renderButton()

    expect(
      screen.getByRole('button', { name: 'Odebrat z košíku' }),
    ).toBeDefined()
    expect(screen.getByRole('status').textContent).toContain(
      'Kniha je v košíku.',
    )
  })

  it('says the cart is full instead of adding', async () => {
    const items = Array.from({ length: MAX_CART_ITEMS }, (_, i) => ({
      shortId: `b${String(i).padStart(7, '0')}`,
      priceMinorSeen: 1,
    }))
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ v: 1, items }))
    renderButton()

    fireEvent.click(screen.getByRole('button', { name: 'Přidat do košíku' }))

    expect(screen.getByRole('status').textContent).toContain('Košík je plný.')
    expect(storedItems()).toHaveLength(MAX_CART_ITEMS)
  })

  it('disables the button for a reserved book and explains why', () => {
    renderButton({ status: 'reserved' })

    const button = screen.getByRole('button', { name: 'Přidat do košíku' })
    expect(button).toHaveProperty('disabled', true)
    expect(
      screen.getByText('Tato kniha je právě rezervovaná pro jiného zákazníka.'),
    ).toBeDefined()
  })

  it('disables the button for a sold book and gives the date', async () => {
    renderButton({ status: 'sold' })

    expect(
      screen.getByRole('button', { name: 'Přidat do košíku' }),
    ).toHaveProperty('disabled', true)
    expect(
      screen.getByText('Tato kniha už byla prodána 3. října 2026.'),
    ).toBeDefined()
  })

  it('never writes to the cart for a book that cannot be bought', async () => {
    renderButton({ status: 'sold' })

    fireEvent.click(screen.getByRole('button', { name: 'Přidat do košíku' }))

    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull()
  })
})
