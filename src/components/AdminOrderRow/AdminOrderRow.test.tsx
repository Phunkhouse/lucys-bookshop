import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { AdminOrderItem } from '@/server/admin/order-list'
import { AdminOrderRow } from './AdminOrderRow'

const now = new Date('2026-10-18T12:00:00.000Z')

const order: AdminOrderItem = {
  id: '5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50',
  number: 20260007,
  name: 'Jana Nováková',
  stage: 'awaiting_payment',
  expiringSoon: false,
  paymentMethod: 'bank_transfer',
  shippingMethod: 'zasilkovna',
  totalMinor: 32800,
  currency: 'CZK',
  bookCount: 2,
  createdAt: new Date('2026-10-15T12:00:00.000Z'),
}

const render = (overrides: Partial<AdminOrderItem> = {}) =>
  renderWithIntl(<AdminOrderRow order={{ ...order, ...overrides }} now={now} />)

describe('AdminOrderRow', () => {
  it('shows the number as a heading, the buyer, the total and the stage', () => {
    render()

    expect(screen.getByRole('heading', { name: /20260007/ })).toBeTruthy()
    expect(screen.getByText('Jana Nováková')).toBeTruthy()
    expect(screen.getByText(/328\s*Kč/)).toBeTruthy()
    expect(screen.getByText('Čeká na platbu')).toBeTruthy()
  })

  it('shows how the buyer pays and receives the books', () => {
    render({ paymentMethod: 'cash_on_pickup', shippingMethod: 'pickup' })

    expect(screen.getByText(/Hotově při převzetí/)).toBeTruthy()
    expect(screen.getByText(/Osobní odběr/)).toBeTruthy()
  })

  it('says how long ago it was placed', () => {
    render()

    expect(screen.getByText('Zadáno před 3 dny')).toBeTruthy()
  })

  it('links to the order with an accessible name that tells orders apart', () => {
    render()

    const link = screen.getByRole('link', { name: /20260007/ })
    expect(link.getAttribute('href')).toBe('/admin/orders/20260007')
  })

  it('flags an order that expires soon', () => {
    render({ expiringSoon: true })

    expect(screen.getByText('Brzy vyprší')).toBeTruthy()
  })

  it('does not flag an order that is not about to expire', () => {
    render({ expiringSoon: false })

    expect(screen.queryByText('Brzy vyprší')).toBeNull()
  })

  it.each([
    ['expired', 'Vypršelá'],
    ['paid', 'Zaplaceno'],
    ['shipped', 'Odesláno'],
    ['completed', 'Vyřízeno'],
    ['cancelled', 'Zrušeno'],
    ['refunded', 'Vráceno'],
  ] as const)('shows the %s stage in words', (stage, label) => {
    render({ stage })

    expect(screen.getByText(label)).toBeTruthy()
  })
})
