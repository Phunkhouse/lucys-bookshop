import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { AdminOrderDetail as OrderData } from '@/server/admin/order-detail'
import { AdminOrderDetail } from './AdminOrderDetail'

const now = new Date('2026-10-18T12:00:00.000Z')

const order: OrderData = {
  id: '5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50',
  number: 20260007,
  publicToken: 'T'.repeat(43),
  stage: 'awaiting_payment',
  expiringSoon: false,
  name: 'Jana Nováková',
  email: 'jana@example.com',
  phone: '+420 601 234 567',
  paymentMethod: 'bank_transfer',
  shippingMethod: 'pickup',
  shippingDetails: null,
  trackingNumber: null,
  shippingCostMinor: 0,
  totalMinor: 23900,
  currency: 'CZK',
  note: null,
  createdAt: new Date('2026-10-17T12:00:00.000Z'),
  paidAt: null,
  expiresAt: new Date('2026-10-19T12:00:00.000Z'),
  items: [
    { bookId: 'book-1', title: 'Babička', priceMinor: 18900 },
    { bookId: 'book-2', title: 'Saturnin', priceMinor: 5000 },
  ],
  conflicts: [],
}

const render = (overrides: Partial<OrderData> = {}) =>
  renderWithIntl(
    <AdminOrderDetail
      order={{ ...order, ...overrides }}
      now={now}
      buyerOrderUrl="https://shop.example/order/abc"
      shopName="Lucy's Bookshop"
    />,
  )

function mail() {
  const href = screen
    .getByRole('link', { name: 'Napsat kupujícímu' })
    .getAttribute('href')!
  const url = new URL(href)
  return {
    to: decodeURIComponent(url.pathname),
    subject: url.searchParams.get('subject') ?? '',
    body: url.searchParams.get('body') ?? '',
  }
}

describe('AdminOrderDetail', () => {
  it('shows the number as the page heading and the stage in words', () => {
    render()

    expect(
      screen.getByRole('heading', { level: 1, name: /20260007/ }),
    ).toBeTruthy()
    expect(screen.getByText('Čeká na platbu')).toBeTruthy()
  })

  it('shows who the buyer is, with a phone link', () => {
    render()

    expect(screen.getByText('Jana Nováková')).toBeTruthy()
    expect(screen.getByText('jana@example.com')).toBeTruthy()
    const phone = screen.getByRole('link', { name: '+420 601 234 567' })
    expect(phone.getAttribute('href')).toBe('tel:+420601234567')
  })

  it('lists the books with the prices the order was placed with, and the total', () => {
    render()

    const items = screen.getByRole('list', { name: 'Knihy v objednávce' })
    expect(within(items).getByText('Babička')).toBeTruthy()
    expect(within(items).getByText(/189\s*Kč/)).toBeTruthy()
    expect(within(items).getByText('Saturnin')).toBeTruthy()
    expect(within(items).getByText(/50\s*Kč/)).toBeTruthy()
    expect(screen.getByText(/239\s*Kč/)).toBeTruthy()
  })

  it('links each book to its edit page', () => {
    render()

    expect(
      screen.getByRole('link', { name: /Babička/ }).getAttribute('href'),
    ).toBe('/admin/books/book-1/edit')
  })

  it('shows the pickup point and tracking number for Zásilkovna only', () => {
    render({
      shippingMethod: 'zasilkovna',
      shippingDetails: 'Výdejní místo Praha 1',
      trackingNumber: 'Z123456789',
      shippingCostMinor: 8900,
    })

    expect(screen.getByText('Výdejní místo Praha 1')).toBeTruthy()
    expect(screen.getByText('Z123456789')).toBeTruthy()
  })

  it('says so when a Zásilkovna order has no pickup point', () => {
    render({ shippingMethod: 'zasilkovna', shippingDetails: null })

    expect(screen.getByText('Neuvedeno')).toBeTruthy()
  })

  it('shows a phone number without digits as plain text, not a dead link', () => {
    render({ phone: 'není' })

    expect(screen.getByText('není')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'není' })).toBeNull()
  })

  it('shows neither for a personal pickup', () => {
    render({ shippingMethod: 'pickup' })

    expect(screen.queryByText('Číslo zásilky')).toBeNull()
    expect(screen.getByText('Osobní odběr')).toBeTruthy()
  })

  it('shows the note only when there is one', () => {
    const { unmount } = render({ note: 'zaplatila o 50 Kč méně' })
    expect(screen.getByText('zaplatila o 50 Kč méně')).toBeTruthy()
    unmount()

    render({ note: null })
    expect(screen.queryByText('Poznámka')).toBeNull()
  })

  it('shows the deadline on the shop clock while the order waits for payment', () => {
    // 22:30 UTC on the 18th is 0:30 on the 19th in Prague.
    render({ expiresAt: new Date('2026-10-18T22:30:00.000Z') })

    expect(screen.getByText(/19\. října 2026.*0:30/)).toBeTruthy()
  })

  it('flags an order that expires soon', () => {
    render({ expiringSoon: true })

    expect(screen.getByText('Brzy vyprší')).toBeTruthy()
  })

  describe('books in conflict', () => {
    it('warns, naming the books, when the seller would have to refund', () => {
      render({
        stage: 'expired',
        conflicts: [{ id: 'book-2', title: 'Saturnin', reason: 'reserved' }],
      })

      const alert = screen.getByRole('alert')
      expect(within(alert).getByText(/Saturnin/)).toBeTruthy()
    })

    it('shows no warning when nothing is in conflict', () => {
      render({ conflicts: [] })

      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  describe('write to the buyer', () => {
    it('reminds about the deadline and links the order page while awaiting payment', () => {
      render()

      const { to, subject, body } = mail()
      expect(to).toBe('jana@example.com')
      expect(subject).toContain('20260007')
      expect(body).toContain('Jana Nováková')
      expect(body).toContain('https://shop.example/order/abc')
      expect(body).toContain("Lucy's Bookshop")
    })

    it('says the payment arrived once the order is paid', () => {
      render({ stage: 'paid', paidAt: new Date('2026-10-18T09:00:00.000Z') })

      expect(mail().body).toMatch(/platb/i)
      expect(mail().body).not.toContain('https://shop.example/order/abc')
    })

    it('gives the tracking number once the order is shipped', () => {
      render({
        stage: 'shipped',
        shippingMethod: 'zasilkovna',
        trackingNumber: 'Z123456789',
      })

      expect(mail().body).toContain('Z123456789')
    })

    it('has no ready-made message for a finished order', () => {
      render({ stage: 'completed' })

      const href = screen
        .getByRole('link', { name: 'Napsat kupujícímu' })
        .getAttribute('href')!
      expect(href).toBe('mailto:jana@example.com')
    })
  })
})
