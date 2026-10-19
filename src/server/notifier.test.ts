import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSellerNotifier } from './notifier'
import type { NotifiableOrder } from './notification-messages'
import { ConsoleNotifier } from './console-notifier'
import { ResendNotifier } from './resend-notifier'

const order: NotifiableOrder = {
  number: 20260007,
  name: 'Jana Nováková',
  items: [{ title: 'Babička', priceMinor: 18900 }],
  totalMinor: 18900,
  currency: 'CZK',
  paymentMethod: 'bank_transfer',
  shippingMethod: 'pickup',
  expiresAt: new Date('2026-10-19T12:00:00.000Z'),
  adminUrl: 'https://shop.example/admin/orders/20260007',
}

afterEach(() => vi.restoreAllMocks())

describe('createSellerNotifier', () => {
  it('logs only when nothing is configured, so dev and CI need no secrets', () => {
    expect(createSellerNotifier({})).toBeInstanceOf(ConsoleNotifier)
  })

  it('sends through Resend when the key, recipient and sender are set', () => {
    expect(
      createSellerNotifier({
        apiKey: 're_test_key',
        to: 'seller@example.com',
        from: 'objednavky@example.com',
      }),
    ).toBeInstanceOf(ResendNotifier)
  })

  it('refuses a key without a recipient or a sender', () => {
    expect(() =>
      createSellerNotifier({ apiKey: 're_test_key', to: 'a@b.cz' }),
    ).toThrow()
    expect(() =>
      createSellerNotifier({ apiKey: 're_test_key', from: 'a@b.cz' }),
    ).toThrow()
  })
})

describe('ConsoleNotifier', () => {
  it('writes the message to the log and sends nothing', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})

    await new ConsoleNotifier().notifyNewOrder(order)

    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0].join(' '))).toContain('20260007')
  })
})
