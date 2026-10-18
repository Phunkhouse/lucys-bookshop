import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { OrderView } from '@/server/order-view'
import type { PaymentInstructions } from '@/server/payment-instructions'
import { OrderDetails } from './OrderDetails'

const IBAN = 'CZ6508000000192000145399'

const view: OrderView = {
  number: 20260042,
  stage: 'awaiting_payment',
  paymentMethod: 'bank_transfer',
  shippingMethod: 'pickup',
  shippingDetails: null,
  trackingNumber: null,
  items: [
    { title: 'První kniha', priceMinor: 18900 },
    { title: 'Druhá kniha', priceMinor: 47800 },
  ],
  shippingCostMinor: 0,
  totalMinor: 66700,
  currency: 'CZK',
  // 15:14 in Prague (summer time).
  expiresAt: new Date('2026-10-20T13:14:00.000Z'),
}

const ready: PaymentInstructions = {
  status: 'ready',
  spayd: `SPD*1.0*ACC:${IBAN}*AM:667.00*CC:CZK*X-VS:20260042*MSG:OBJEDNAVKA 20260042`,
  iban: IBAN,
  account: '19-2000145399/0800',
  amountMinor: 66700,
  variableSymbol: '20260042',
}

function renderOrder(
  order: Partial<OrderView> = {},
  payment: PaymentInstructions | null = null,
  pickupInstructions = '',
) {
  return renderWithIntl(
    <OrderDetails
      order={{ ...view, ...order }}
      payment={payment}
      pickupInstructions={pickupInstructions}
    />,
  )
}

describe('OrderDetails', () => {
  describe('waiting for a bank transfer', () => {
    it('shows the QR code and every detail needed to pay by hand', () => {
      renderOrder({}, ready)

      expect(
        screen.getByRole('heading', {
          name: 'Objednávka č. 20260042',
          level: 1,
        }),
      ).toBeDefined()
      expect(
        screen.getByRole('heading', { name: 'Čeká na platbu' }),
      ).toBeDefined()
      expect(
        screen.getByRole('img', { name: 'QR kód pro platbu' }),
      ).toBeDefined()
      const pay = screen.getByRole('region', { name: 'Zaplaťte převodem' })
      expect(within(pay).getByText('19-2000145399/0800')).toBeDefined()
      expect(
        within(pay).getByText('CZ65 0800 0000 1920 0014 5399'),
      ).toBeDefined()
      expect(within(pay).getByText(/^667\s*Kč$/)).toBeDefined()
      expect(within(pay).getByText('20260042')).toBeDefined()
    })

    it('tells until when the books are held, on the shop clock', () => {
      renderOrder({}, ready)
      const text = screen.getByText(/rezervované do/).textContent
      expect(text).toMatch(/20\. října 2026/)
      expect(text).toMatch(/15:14/)
    })

    it('asks the buyer to keep the page, since no e-mail is sent', () => {
      renderOrder({}, ready)
      expect(screen.getByText(/Uložte si tuto stránku/)).toBeDefined()
    })

    it('says so when the payment details are not set up, and shows no QR code', () => {
      renderOrder({}, { status: 'not_configured' })
      expect(screen.queryByRole('img')).toBeNull()
      expect(
        screen.getByText(/Platební údaje nejsou zatím nastavené/),
      ).toBeDefined()
    })

    it('shows the details without a QR code when there is nothing to pay', () => {
      renderOrder({ totalMinor: 0 }, { ...ready, spayd: null, amountMinor: 0 })
      expect(screen.queryByRole('img')).toBeNull()
      expect(screen.getByText('19-2000145399/0800')).toBeDefined()
    })
  })

  describe('cash on pickup', () => {
    it('shows the pickup instructions instead of the QR code and account', () => {
      renderOrder(
        { paymentMethod: 'cash_on_pickup' },
        null,
        'Po–Pá po 17. hodině, Dlouhá 5.',
      )
      expect(
        screen.getByRole('heading', {
          name: 'Rezervováno, zaplatíte při převzetí',
        }),
      ).toBeDefined()
      expect(screen.getByText('Po–Pá po 17. hodině, Dlouhá 5.')).toBeDefined()
      expect(screen.queryByRole('img')).toBeNull()
      expect(screen.queryByText('Číslo účtu')).toBeNull()
      expect(screen.getByText(/rezervované do/)).toBeDefined()
    })
  })

  describe('what the order says', () => {
    it('lists the books, shipping and total', () => {
      renderOrder({}, ready)
      const summary = screen.getByRole('region', { name: 'Co jste objednali' })
      expect(within(summary).getByText('První kniha')).toBeDefined()
      expect(within(summary).getByText(/^189\s*Kč$/)).toBeDefined()
      expect(within(summary).getByText('zdarma')).toBeDefined()
      expect(within(summary).getByText('Celkem')).toBeDefined()
      expect(within(summary).getAllByText(/^667\s*Kč$/).length).toBeGreaterThan(
        0,
      )
    })

    it('shows the Zásilkovna price and the pickup point', () => {
      renderOrder(
        {
          shippingMethod: 'zasilkovna',
          shippingDetails: 'Z-Box Praha 1, Dlouhá 5',
          shippingCostMinor: 8900,
          totalMinor: 75600,
        },
        ready,
      )
      const summary = screen.getByRole('region', { name: 'Co jste objednali' })
      expect(within(summary).getByText(/^89\s*Kč$/)).toBeDefined()
      expect(within(summary).getByText(/Z-Box Praha 1, Dlouhá 5/)).toBeDefined()
    })
  })

  describe('other states', () => {
    it('shows an expired reservation with no way to pay', () => {
      renderOrder({ stage: 'expired' })
      expect(
        screen.getByRole('heading', { name: 'Rezervace vypršela' }),
      ).toBeDefined()
      expect(screen.getByText(/Pokud jste už zaplatili/)).toBeDefined()
      expect(screen.queryByRole('img')).toBeNull()
      expect(screen.queryByText('Číslo účtu')).toBeNull()
    })

    it('thanks the buyer once paid, and says what comes next for each delivery', () => {
      const { unmount } = renderOrder({ stage: 'paid' })
      expect(
        screen.getByRole('heading', { name: 'Zaplaceno, děkujeme' }),
      ).toBeDefined()
      expect(screen.getByText(/ohledně převzetí/)).toBeDefined()
      unmount()

      renderOrder({
        stage: 'paid',
        shippingMethod: 'zasilkovna',
        shippingDetails: 'Z-Box',
      })
      expect(screen.getByText(/Balík odešleme Zásilkovnou/)).toBeDefined()
    })

    it('shows the tracking number when shipped', () => {
      renderOrder({
        stage: 'shipped',
        shippingMethod: 'zasilkovna',
        trackingNumber: 'Z123456789',
      })
      expect(screen.getByRole('heading', { name: 'Odesláno' })).toBeDefined()
      expect(screen.getByText(/Z123456789/)).toBeDefined()
    })

    it.each([
      ['completed', 'Vyřízeno'],
      ['cancelled', 'Zrušeno'],
      ['refunded', 'Peníze jsme vrátili'],
    ] as const)('shows a %s order', (stage, heading) => {
      renderOrder({ stage })
      expect(screen.getByRole('heading', { name: heading })).toBeDefined()
      expect(screen.queryByRole('img')).toBeNull()
    })
  })
})
