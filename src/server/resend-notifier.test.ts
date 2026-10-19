import { describe, expect, it, vi } from 'vitest'
import type { NotifiableOrder } from './notification-messages'
import { ResendNotifier } from './resend-notifier'

const API_KEY = 're_test_key_for_the_test'

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

function notifier(fetch: typeof globalThis.fetch, timeoutMs = 8000) {
  return new ResendNotifier({
    apiKey: API_KEY,
    from: "Lucy's Bookshop <objednavky@example.com>",
    to: 'seller@example.com',
    fetch,
    timeoutMs,
  })
}

const ok = () =>
  Promise.resolve(
    new Response(JSON.stringify({ id: 'abc' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )

describe('ResendNotifier', () => {
  it('posts the message to Resend with the key, sender and recipient', async () => {
    const fetch = vi.fn(ok)

    await notifier(fetch).notifyNewOrder(order)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${API_KEY}`,
    )
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      from: "Lucy's Bookshop <objednavky@example.com>",
      to: ['seller@example.com'],
      subject: expect.stringContaining('20260007'),
      text: expect.stringContaining('Jana Nováková'),
    })
    // Plain text only.
    expect(body.html).toBeUndefined()
  })

  it('fails when Resend refuses, without the key in the error', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Invalid sender' }), {
          status: 422,
        }),
      ),
    )

    const failure = await notifier(fetch)
      .notifyNewOrder(order)
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(failure).toBeInstanceOf(Error)
    expect(String((failure as Error).message)).toContain('422')
    expect(String(failure)).not.toContain(API_KEY)
  })

  it('fails when the network fails, without the key in the error', async () => {
    const fetch = vi.fn(() => Promise.reject(new Error('socket hang up')))

    const failure = await notifier(fetch)
      .notifyNewOrder(order)
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).not.toContain(API_KEY)
  })

  it('gives up when Resend does not answer in time', async () => {
    // Never answers, but honours the abort signal like the real fetch.
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    )

    await expect(
      notifier(fetch as unknown as typeof globalThis.fetch, 20).notifyNewOrder(
        order,
      ),
    ).rejects.toThrow()
  })
})
