import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_STORAGE_KEY } from '@/lib/cart-store'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { CartValidation } from '@/server/cart'
import type { CartLine } from '@/server/cart-rules'
import { CartView } from './CartView'

beforeEach(() => localStorage.clear())

const BASE = 'https://pub-abc.r2.dev'

const storedItems = () =>
  JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '{"items":[]}').items

function store(items: { shortId: string; priceMinorSeen: number }[]) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ v: 1, items }))
}

const listed = (shortId: string, title: string) => ({
  shortId,
  title,
  author: 'Autor',
  currency: 'CZK',
  cover: null,
})

const ok = (shortId: string, title: string, priceMinor: number): CartLine => ({
  ...listed(shortId, title),
  kind: 'ok',
  priceMinor,
})

function validation(lines: CartLine[]): CartValidation {
  let subtotalMinor = 0
  for (const line of lines) {
    if (line.kind === 'ok' || line.kind === 'price_changed') {
      subtotalMinor += line.priceMinor
    }
  }
  return { lines, subtotalMinor, currency: 'CZK' }
}

const answer = (lines: CartLine[]) => ({
  ok: true as const,
  validation: validation(lines),
})

function renderCart(
  validate: React.ComponentProps<typeof CartView>['validate'],
) {
  return renderWithIntl(<CartView imageBaseUrl={BASE} validate={validate} />)
}

describe('CartView', () => {
  it('shows the empty cart with a way back, without asking the server', () => {
    const validate = vi.fn()
    renderCart(validate)

    expect(
      screen.getByRole('heading', { name: 'Košík', level: 1 }),
    ).toBeDefined()
    expect(screen.getByText('Košík je prázdný.')).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Zpět na knihy' }).getAttribute('href'),
    ).toBe('/')
    expect(validate).not.toHaveBeenCalled()
  })

  it('sends the cart to the server and shows the books with the server subtotal', async () => {
    store([
      { shortId: 'aaaaaa11', priceMinorSeen: 18900 },
      { shortId: 'bbbbbb22', priceMinorSeen: 5000 },
    ])
    const validate = vi
      .fn()
      .mockResolvedValue(
        answer([
          ok('aaaaaa11', 'První kniha', 18900),
          ok('bbbbbb22', 'Druhá kniha', 5000),
        ]),
      )
    renderCart(validate)

    expect(screen.getByText('Kontroluji košík…')).toBeDefined()
    expect(await screen.findByText('První kniha')).toBeDefined()
    expect(screen.getByText('Druhá kniha')).toBeDefined()
    expect(validate).toHaveBeenCalledWith([
      { shortId: 'aaaaaa11', priceMinorSeen: 18900 },
      { shortId: 'bbbbbb22', priceMinorSeen: 5000 },
    ])
    expect(screen.getByText('Mezisoučet (bez dopravy)')).toBeDefined()
    expect(screen.getByText(/^239\s*Kč$/)).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'První kniha' }).getAttribute('href'),
    ).toBe('/books/aaaaaa11/prvni-kniha')
  })

  it('removes a book from the cart and the page', async () => {
    store([
      { shortId: 'aaaaaa11', priceMinorSeen: 18900 },
      { shortId: 'bbbbbb22', priceMinorSeen: 5000 },
    ])
    const validate = vi
      .fn()
      .mockResolvedValueOnce(
        answer([
          ok('aaaaaa11', 'První kniha', 18900),
          ok('bbbbbb22', 'Druhá kniha', 5000),
        ]),
      )
      .mockResolvedValue(answer([ok('bbbbbb22', 'Druhá kniha', 5000)]))
    renderCart(validate)
    await screen.findByText('První kniha')

    fireEvent.click(
      screen.getByRole('button', { name: 'Odebrat z košíku: První kniha' }),
    )

    await waitFor(() => expect(screen.queryByText('První kniha')).toBeNull())
    expect(storedItems()).toEqual([
      { shortId: 'bbbbbb22', priceMinorSeen: 5000 },
    ])
    expect(
      await screen.findByText(/^50\s*Kč$/, { selector: 'strong' }),
    ).toBeDefined()
  })

  it('shows the empty cart after the last book is removed', async () => {
    store([{ shortId: 'aaaaaa11', priceMinorSeen: 18900 }])
    renderCart(
      vi.fn().mockResolvedValue(answer([ok('aaaaaa11', 'První kniha', 18900)])),
    )
    await screen.findByText('První kniha')

    fireEvent.click(screen.getByRole('button', { name: /^Odebrat z košíku/ }))

    expect(await screen.findByText('Košík je prázdný.')).toBeDefined()
  })

  it('asks the buyer to accept a changed price, then remembers it', async () => {
    store([{ shortId: 'aaaaaa11', priceMinorSeen: 10000 }])
    const changed: CartLine = {
      ...listed('aaaaaa11', 'První kniha'),
      kind: 'price_changed',
      priceMinor: 12000,
      seenPriceMinor: 10000,
    }
    const validate = vi
      .fn()
      .mockResolvedValueOnce(answer([changed]))
      .mockResolvedValue(answer([ok('aaaaaa11', 'První kniha', 12000)]))
    renderCart(validate)

    expect(
      await screen.findByText(
        /Cena se změnila: dříve 100\s*Kč, nyní 120\s*Kč\./,
      ),
    ).toBeDefined()

    fireEvent.click(
      screen.getByRole('button', { name: 'Souhlasím s novou cenou' }),
    )

    expect(storedItems()).toEqual([
      { shortId: 'aaaaaa11', priceMinorSeen: 12000 },
    ])
    await waitFor(() =>
      expect(screen.queryByText(/Cena se změnila/)).toBeNull(),
    )
    expect(validate).toHaveBeenLastCalledWith([
      { shortId: 'aaaaaa11', priceMinorSeen: 12000 },
    ])
  })

  it('removes books that were taken meanwhile, and says which and why', async () => {
    store([
      { shortId: 'aaaaaa11', priceMinorSeen: 100 },
      { shortId: 'bbbbbb22', priceMinorSeen: 200 },
      { shortId: 'cccccc33', priceMinorSeen: 300 },
      { shortId: 'dddddd44', priceMinorSeen: 400 },
    ])
    const lines: CartLine[] = [
      ok('aaaaaa11', 'Zůstane', 100),
      {
        ...listed('bbbbbb22', 'Rezervovaná'),
        kind: 'unavailable',
        reason: 'reserved',
      },
      { ...listed('cccccc33', 'Prodaná'), kind: 'unavailable', reason: 'sold' },
      { kind: 'gone', shortId: 'dddddd44' },
    ]
    // The second answer is for the smaller cart that is checked again.
    renderCart(
      vi
        .fn()
        .mockResolvedValueOnce(answer(lines))
        .mockResolvedValue(answer([ok('aaaaaa11', 'Zůstane', 100)])),
    )

    expect(await screen.findByText('Z košíku jsme odebrali:')).toBeDefined()
    expect(
      screen.getByText('Rezervovaná – mezitím ji rezervoval někdo jiný.'),
    ).toBeDefined()
    expect(screen.getByText('Prodaná – mezitím byla prodána.')).toBeDefined()
    expect(screen.getByText('Kniha, která už není v nabídce.')).toBeDefined()
    expect(screen.getByText('Zůstane')).toBeDefined()
    expect(screen.queryByText('Rezervovaná')).toBeNull()
    expect(storedItems()).toEqual([
      { shortId: 'aaaaaa11', priceMinorSeen: 100 },
    ])
  })

  it('can dismiss the notice about removed books', async () => {
    store([{ shortId: 'bbbbbb22', priceMinorSeen: 200 }])
    renderCart(
      vi.fn().mockResolvedValue(
        answer([
          {
            ...listed('bbbbbb22', 'Prodaná'),
            kind: 'unavailable',
            reason: 'sold',
          },
        ]),
      ),
    )
    await screen.findByText('Z košíku jsme odebrali:')

    fireEvent.click(screen.getByRole('button', { name: 'Rozumím' }))

    expect(screen.queryByText('Z košíku jsme odebrali:')).toBeNull()
    expect(screen.getByText('Košík je prázdný.')).toBeDefined()
  })

  it('says so when the check fails, and tries again on request', async () => {
    store([{ shortId: 'aaaaaa11', priceMinorSeen: 100 }])
    const validate = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(answer([ok('aaaaaa11', 'První kniha', 100)]))
    renderCart(validate)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Košík se nepodařilo zkontrolovat.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }))

    expect(await screen.findByText('První kniha')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('treats a refusal from the server like a failed check', async () => {
    store([{ shortId: 'aaaaaa11', priceMinorSeen: 100 }])
    renderCart(vi.fn().mockResolvedValue({ ok: false }))

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(storedItems()).toHaveLength(1) // nothing is thrown away on a failed check
  })
})
