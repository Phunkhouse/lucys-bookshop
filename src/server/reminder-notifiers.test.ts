import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConsoleNotifier } from './console-notifier'
import type { ExpiringOrder } from './notification-messages'
import { ResendNotifier } from './resend-notifier'

const API_KEY = 're_test_key_for_the_test'

const orders: ExpiringOrder[] = [
  {
    number: 20260007,
    name: 'Jana Nováková',
    totalMinor: 23900,
    currency: 'CZK',
    expiresAt: new Date('2026-10-19T09:00:00.000Z'),
    adminUrl: 'https://shop.example/admin/orders/20260007',
  },
]

function notifier(fetch: typeof globalThis.fetch) {
  return new ResendNotifier({
    apiKey: API_KEY,
    from: "Lucy's Bookshop <objednavky@example.com>",
    to: 'seller@example.com',
    fetch,
  })
}

afterEach(() => vi.restoreAllMocks())

describe('ResendNotifier.notifyReservationExpiring', () => {
  it('posts the reminder to Resend', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'abc' }), { status: 200 }),
      ),
    )

    await notifier(fetch).notifyReservationExpiring(orders)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      from: "Lucy's Bookshop <objednavky@example.com>",
      to: ['seller@example.com'],
      subject: 'Brzy vyprší rezervace (1)',
      text: expect.stringContaining('20260007'),
    })
  })

  it('fails when Resend refuses, without the key in the error', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(new Response('{}', { status: 429 })),
    )

    const failure = await notifier(fetch)
      .notifyReservationExpiring(orders)
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain('429')
    expect(String(failure)).not.toContain(API_KEY)
  })

  it('fails when the network fails', async () => {
    const fetch = vi.fn(() => Promise.reject(new Error('socket hang up')))

    await expect(
      notifier(fetch).notifyReservationExpiring(orders),
    ).rejects.toThrow()
  })
})

describe('ConsoleNotifier.notifyReservationExpiring', () => {
  it('writes the reminder to the log and sends nothing', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})

    await new ConsoleNotifier().notifyReservationExpiring(orders)

    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0].join(' '))).toContain('20260007')
  })
})
