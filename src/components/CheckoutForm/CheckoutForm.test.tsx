import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { CART_STORAGE_KEY } from '@/lib/cart-store'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { CheckoutResult } from '@/server/checkout'
import type { CartValidation } from '@/server/cart'
import type { CartLine } from '@/server/cart-rules'
import { CheckoutForm } from './CheckoutForm'

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => ({
  ...(await vi.importActual<typeof import('@/i18n/navigation')>(
    '@/i18n/navigation',
  )),
  useRouter: () => ({ push, refresh }),
}))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

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

function answer(lines: CartLine[]) {
  let subtotalMinor = 0
  for (const line of lines) {
    if (line.kind === 'ok' || line.kind === 'price_changed') {
      subtotalMinor += line.priceMinor
    }
  }
  const validation: CartValidation = { lines, subtotalMinor, currency: 'CZK' }
  return { ok: true as const, validation }
}

const TWO_BOOKS = [
  { shortId: 'aaaaaa11', priceMinorSeen: 18900 },
  { shortId: 'bbbbbb22', priceMinorSeen: 5000 },
]
const twoLines = () =>
  answer([
    ok('aaaaaa11', 'První kniha', 18900),
    ok('bbbbbb22', 'Druhá kniha', 5000),
  ])

type Props = Partial<React.ComponentProps<typeof CheckoutForm>>
function renderForm(props: Props = {}) {
  const submit = props.submit ?? vi.fn()
  const validate = props.validate ?? vi.fn().mockResolvedValue(twoLines())
  const { container } = renderWithIntl(
    <CheckoutForm
      validate={validate}
      submit={submit}
      zasilkovnaPriceMinor={8900}
      pickupInstructions=""
      {...props}
    />,
  )
  return { submit, validate, container }
}

async function ready() {
  await screen.findByText('První kniha')
}

function fillContact() {
  fireEvent.change(screen.getByLabelText('Jméno a příjmení'), {
    target: { value: 'Jana Nováková' },
  })
  fireEvent.change(screen.getByLabelText('E-mail'), {
    target: { value: 'jana@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Telefon'), {
    target: { value: '+420 601 234 567' },
  })
}
const tick = (name: string) => fireEvent.click(screen.getByLabelText(name))
const tickConsents = () => {
  tick('Souhlasím s obchodními podmínkami')
  tick('Beru na vědomí zásady ochrany osobních údajů')
}
const send = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Odeslat objednávku' }))

describe('CheckoutForm', () => {
  it('shows the empty state, without asking the server', () => {
    const { validate } = renderForm()

    expect(screen.getByText('Košík je prázdný.')).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Zpět na knihy' }).getAttribute('href'),
    ).toBe('/')
    expect(
      screen.queryByRole('button', { name: 'Odeslat objednávku' }),
    ).toBeNull()
    expect(validate).not.toHaveBeenCalled()
  })

  it('summarises the books with server prices; pickup is free', async () => {
    store(TWO_BOOKS)
    renderForm()
    await ready()

    const summary = screen.getByRole('region', { name: 'Vaše objednávka' })
    expect(within(summary).getByText('Druhá kniha')).toBeDefined()
    expect(within(summary).getByText(/^189\s*Kč$/)).toBeDefined()
    expect(within(summary).getByText('zdarma')).toBeDefined()
    // The books and the total are both 239 Kč.
    expect(within(summary).getAllByText(/^239\s*Kč$/)).toHaveLength(2)
  })

  it('adds the Zásilkovna flat rate and asks for the pickup point', async () => {
    store(TWO_BOOKS)
    renderForm()
    await ready()
    expect(screen.queryByLabelText('Výdejní místo Zásilkovny')).toBeNull()

    fireEvent.click(screen.getByLabelText(/^Zásilkovna/))

    expect(screen.getByLabelText('Výdejní místo Zásilkovny')).toBeDefined()
    const summary = screen.getByRole('region', { name: 'Vaše objednávka' })
    expect(within(summary).getByText(/^89\s*Kč$/)).toBeDefined() // shipping
    expect(within(summary).getByText(/^328\s*Kč$/)).toBeDefined() // total
  })

  it('offers cash only with personal pickup', async () => {
    store(TWO_BOOKS)
    renderForm()
    await ready()
    expect(screen.getByLabelText('Hotově při osobním převzetí')).toBeDefined()

    fireEvent.click(screen.getByLabelText('Hotově při osobním převzetí'))
    fireEvent.click(screen.getByLabelText(/^Zásilkovna/))

    expect(screen.queryByLabelText('Hotově při osobním převzetí')).toBeNull()
    expect(
      (screen.getByLabelText(/^Převodem/) as HTMLInputElement).checked,
    ).toBe(true)

    fireEvent.click(screen.getByLabelText(/^Osobní odběr/))
    expect(screen.getByLabelText('Hotově při osobním převzetí')).toBeDefined()
  })

  it('does not offer Zásilkovna until the seller has set a price', async () => {
    store(TWO_BOOKS)
    renderForm({ zasilkovnaPriceMinor: null })
    await ready()
    expect(screen.queryByLabelText(/^Zásilkovna/)).toBeNull()
    expect(screen.getByLabelText(/^Osobní odběr/)).toBeDefined()
  })

  it('shows the pickup instructions for personal pickup', async () => {
    store(TWO_BOOKS)
    renderForm({ pickupInstructions: 'Po–Pá po 17. hodině, Dlouhá 5.' })
    await ready()
    expect(screen.getByText('Po–Pá po 17. hodině, Dlouhá 5.')).toBeDefined()
    fireEvent.click(screen.getByLabelText(/^Zásilkovna/))
    expect(screen.queryByText('Po–Pá po 17. hodině, Dlouhá 5.')).toBeNull()
  })

  it('has a hidden honeypot field that assistive technology skips', async () => {
    store(TWO_BOOKS)
    const { container } = renderForm()
    await ready()
    const trap = container.querySelector(
      '[aria-hidden="true"] input[name="website"]',
    )
    expect(trap).not.toBeNull()
    expect((trap as HTMLInputElement).tabIndex).toBe(-1)
  })

  describe('validation', () => {
    it('names every missing field and sends nothing', async () => {
      store(TWO_BOOKS)
      const { submit } = renderForm()
      await ready()

      send()

      expect(await screen.findByText('Napište své jméno.')).toBeDefined()
      expect(screen.getByText('Napište platný e-mail.')).toBeDefined()
      expect(screen.getByText(/^Napište telefon/)).toBeDefined()
      expect(
        screen.getByText('K odeslání je třeba souhlasit s podmínkami.'),
      ).toBeDefined()
      expect(
        screen.getByText(/^K odeslání je třeba vzít na vědomí/),
      ).toBeDefined()
      expect(submit).not.toHaveBeenCalled()
    })

    it('blocks a filled form while a consent box is not ticked', async () => {
      store(TWO_BOOKS)
      const { submit } = renderForm()
      await ready()
      fillContact()
      tick('Beru na vědomí zásady ochrany osobních údajů')

      send()

      expect(
        await screen.findByText('K odeslání je třeba souhlasit s podmínkami.'),
      ).toBeDefined()
      expect(submit).not.toHaveBeenCalled()
    })

    it('needs the pickup point for Zásilkovna', async () => {
      store(TWO_BOOKS)
      const { submit } = renderForm()
      await ready()
      fillContact()
      tickConsents()
      fireEvent.click(screen.getByLabelText(/^Zásilkovna/))

      send()

      expect(
        await screen.findByText('Napište výdejní místo Zásilkovny.'),
      ).toBeDefined()
      expect(submit).not.toHaveBeenCalled()
    })

    it('marks invalid fields for assistive technology', async () => {
      store(TWO_BOOKS)
      renderForm()
      await ready()
      send()
      await screen.findByText('Napište své jméno.')
      const name = screen.getByLabelText('Jméno a příjmení')
      expect(name.getAttribute('aria-invalid')).toBe('true')
      const describedBy = name.getAttribute('aria-describedby')!
      expect(document.getElementById(describedBy)?.textContent).toBe(
        'Napište své jméno.',
      )
    })
  })

  describe('sending', () => {
    it('sends the cart from the browser with the form, then clears it and opens the order', async () => {
      store(TWO_BOOKS)
      const submit = vi
        .fn()
        .mockResolvedValue({ ok: true, publicToken: 'tok-123' })
      renderForm({ submit })
      await ready()
      fillContact()
      tickConsents()
      fireEvent.click(screen.getByLabelText('Hotově při osobním převzetí'))

      send()

      await waitFor(() => expect(push).toHaveBeenCalledWith('/order/tok-123'))
      expect(submit).toHaveBeenCalledTimes(1)
      expect(submit).toHaveBeenCalledWith({
        cart: TWO_BOOKS,
        name: 'Jana Nováková',
        email: 'jana@example.com',
        phone: '+420 601 234 567',
        shippingMethod: 'pickup',
        paymentMethod: 'cash_on_pickup',
        shippingDetails: '',
        shippingMinorSeen: 0,
        acceptTerms: true,
        acceptPrivacy: true,
        website: '',
        checkoutKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      })
      expect(storedItems()).toEqual([])
    })

    it('sends the pickup point for Zásilkovna', async () => {
      store(TWO_BOOKS)
      const submit = vi.fn().mockResolvedValue({ ok: true, publicToken: 't' })
      renderForm({ submit })
      await ready()
      fillContact()
      tickConsents()
      fireEvent.click(screen.getByLabelText(/^Zásilkovna/))
      fireEvent.change(screen.getByLabelText('Výdejní místo Zásilkovny'), {
        target: { value: 'Z-Box Praha 1, Dlouhá 5' },
      })

      send()

      await waitFor(() => expect(submit).toHaveBeenCalled())
      expect(submit.mock.calls[0][0]).toMatchObject({
        shippingMethod: 'zasilkovna',
        paymentMethod: 'bank_transfer',
        shippingDetails: 'Z-Box Praha 1, Dlouhá 5',
        shippingMinorSeen: 8900,
      })
    })

    it('keeps a book added in another tab while the order was sending', async () => {
      store(TWO_BOOKS)
      let finish: (value: CheckoutResult) => void = () => {}
      const submit = vi.fn(
        () => new Promise<CheckoutResult>((resolve) => (finish = resolve)),
      )
      renderForm({ submit })
      await ready()
      fillContact()
      tickConsents()
      send()
      await screen.findByRole('button', { name: 'Odesílám…' })

      const added = { shortId: 'cccccc33', priceMinorSeen: 7000 }
      store([...TWO_BOOKS, added])
      window.dispatchEvent(
        new StorageEvent('storage', { key: CART_STORAGE_KEY }),
      )
      finish({ ok: true, publicToken: 'x' })

      await waitFor(() => expect(push).toHaveBeenCalled())
      expect(storedItems()).toEqual([added])
    })

    it('sends the shipping price it showed, and refreshes if the server says it moved', async () => {
      store(TWO_BOOKS)
      const submit = vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'shipping_changed' })
      renderForm({ submit })
      await ready()
      fillContact()
      tickConsents()
      fireEvent.click(screen.getByLabelText(/^Zásilkovna/))
      fireEvent.change(screen.getByLabelText('Výdejní místo Zásilkovny'), {
        target: { value: 'Z-Box' },
      })

      send()

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Cena dopravy se mezitím změnila.',
      )
      expect(submit.mock.calls[0][0].shippingMinorSeen).toBe(8900)
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(storedItems()).toEqual(TWO_BOOKS)
    })

    it('shows the order that already exists when the retry differs, and keeps the new book', async () => {
      const added = { shortId: 'cccccc33', priceMinorSeen: 7000 }
      store([...TWO_BOOKS, added])
      const validate = vi
        .fn()
        .mockResolvedValue(
          answer([
            ok('aaaaaa11', 'První kniha', 18900),
            ok('bbbbbb22', 'Druhá kniha', 5000),
            ok('cccccc33', 'Třetí kniha', 7000),
          ]),
        )
      const submit = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          reason: 'already_placed',
          publicToken: 'tok-old',
          shortIds: ['aaaaaa11', 'bbbbbb22'],
        })
        .mockResolvedValue({ ok: true, publicToken: 'tok-new' })
      renderForm({ submit, validate })
      await ready()
      fillContact()
      tickConsents()

      send()

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Objednávku jsme už přijali')
      expect(
        within(alert)
          .getByRole('link', { name: 'Zobrazit přijatou objednávku' })
          .getAttribute('href'),
      ).toBe('/order/tok-old')
      expect(storedItems()).toEqual([added])
      expect(push).not.toHaveBeenCalled()

      // The next order is a new one: it must not reuse the old key.
      await waitFor(() =>
        expect(
          (
            screen.getByRole('button', {
              name: 'Odeslat objednávku',
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(false),
      )
      send()
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
      expect(submit.mock.calls[1][0].checkoutKey).not.toBe(
        submit.mock.calls[0][0].checkoutKey,
      )
    })

    it('sends once however often the button is pressed, and says it is working', async () => {
      store(TWO_BOOKS)
      let finish: (value: CheckoutResult) => void = () => {}
      const submit = vi.fn(
        () => new Promise<CheckoutResult>((resolve) => (finish = resolve)),
      )
      renderForm({ submit })
      await ready()
      fillContact()
      tickConsents()

      send()
      const busy = await screen.findByRole('button', { name: 'Odesílám…' })
      expect((busy as HTMLButtonElement).disabled).toBe(true)
      fireEvent.click(busy)
      fireEvent.click(busy)

      expect(submit).toHaveBeenCalledTimes(1)
      finish({ ok: true, publicToken: 'x' })
      await waitFor(() => expect(push).toHaveBeenCalled())
    })

    it.each([
      [
        'unavailable',
        'Některá z knih se mezitím už nedá koupit. Zkontrolujte košík.',
      ],
      [
        'price_changed',
        'Cena některé knihy se mezitím změnila. Zkontrolujte košík.',
      ],
      [
        'shipping_unavailable',
        'Doprava Zásilkovnou teď není k dispozici. Zvolte osobní odběr.',
      ],
      [
        'invalid',
        'Objednávku se nepodařilo odeslat. Zkontrolujte vyplněné údaje.',
      ],
    ] as const)(
      'tells the buyer about %s and keeps the cart',
      async (reason, text) => {
        store(TWO_BOOKS)
        const submit = vi.fn().mockResolvedValue({ ok: false, reason })
        renderForm({ submit })
        await ready()
        fillContact()
        tickConsents()

        send()

        expect((await screen.findByRole('alert')).textContent).toContain(text)
        expect(storedItems()).toEqual(TWO_BOOKS)
        expect(push).not.toHaveBeenCalled()
        // The button works again, and the summary is checked again.
        expect(
          (
            screen.getByRole('button', {
              name: 'Odeslat objednávku',
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(false)
      },
    )

    it('checks the cart again after the server says it changed', async () => {
      store(TWO_BOOKS)
      const validate = vi.fn().mockResolvedValue(twoLines())
      const submit = vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'unavailable' })
      renderForm({ submit, validate })
      await ready()
      fillContact()
      tickConsents()

      send()
      await screen.findByRole('alert')

      await waitFor(() => expect(validate).toHaveBeenCalledTimes(2))
    })

    it('says how long to wait when there were too many attempts', async () => {
      store(TWO_BOOKS)
      const submit = vi.fn().mockResolvedValue({
        ok: false,
        reason: 'rate_limited',
        retryAfterMs: 150_000,
      })
      renderForm({ submit })
      await ready()
      fillContact()
      tickConsents()

      send()

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Zkuste to znovu za 3 minuty.',
      )
    })

    it('shows a general message when the request itself fails', async () => {
      store(TWO_BOOKS)
      const submit = vi.fn().mockRejectedValue(new Error('network'))
      renderForm({ submit })
      await ready()
      fillContact()
      tickConsents()

      send()

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Objednávku se nepodařilo odeslat. Zkuste to prosím znovu.',
      )
      expect(storedItems()).toEqual(TWO_BOOKS)
    })

    it('uses the same checkout key when the buyer tries again', async () => {
      store(TWO_BOOKS)
      const submit = vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ ok: true, publicToken: 't' })
      renderForm({ submit })
      await ready()
      fillContact()
      tickConsents()

      send()
      await screen.findByRole('alert')
      send()
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))

      expect(submit.mock.calls[1][0].checkoutKey).toBe(
        submit.mock.calls[0][0].checkoutKey,
      )
    })
  })

  describe('when the cart changed', () => {
    it('blocks sending and points to the cart if a price moved', async () => {
      store(TWO_BOOKS)
      const validate = vi.fn().mockResolvedValue(
        answer([
          ok('aaaaaa11', 'První kniha', 18900),
          {
            ...listed('bbbbbb22', 'Druhá kniha'),
            kind: 'price_changed',
            priceMinor: 6000,
            seenPriceMinor: 5000,
          },
        ]),
      )
      const { submit } = renderForm({ validate })

      expect((await screen.findByRole('alert')).textContent).toContain(
        'V košíku se něco změnilo.',
      )
      expect(
        screen
          .getByRole('link', { name: 'Zpět do košíku' })
          .getAttribute('href'),
      ).toBe('/cart')
      const button = screen.getByRole('button', {
        name: 'Odeslat objednávku',
      }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
      expect(submit).not.toHaveBeenCalled()
    })

    it('does the same for a book that is no longer available', async () => {
      store(TWO_BOOKS)
      const validate = vi.fn().mockResolvedValue(
        answer([
          ok('aaaaaa11', 'První kniha', 18900),
          {
            ...listed('bbbbbb22', 'Druhá kniha'),
            kind: 'unavailable',
            reason: 'sold',
          },
        ]),
      )
      renderForm({ validate })
      expect(
        await screen.findByRole('link', { name: 'Zpět do košíku' }),
      ).toBeDefined()
    })

    it('can retry when the check itself fails', async () => {
      store(TWO_BOOKS)
      const validate = vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(twoLines())
      renderForm({ validate })

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Košík se nepodařilo zkontrolovat.',
      )
      fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }))
      await ready()
    })
  })
})

// A phone on plain http (a home network, `pnpm dev`) is not a secure context, and
// Safari before 15.4 never had crypto.randomUUID: checkout must still open and
// send a checkout key the server accepts.
describe('CheckoutForm without crypto.randomUUID', () => {
  afterEach(() => vi.unstubAllGlobals())

  function withoutRandomUuid() {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', {
      getRandomValues: real.getRandomValues.bind(real),
    })
  }

  it('opens and sends a checkout key the server accepts', async () => {
    withoutRandomUuid()
    store(TWO_BOOKS)
    const submit = vi.fn().mockResolvedValue({ ok: true, publicToken: 'tok-1' })
    renderForm({ submit })
    await ready()
    fillContact()
    tickConsents()

    send()

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(
      z.uuid().safeParse(submit.mock.calls[0][0].checkoutKey).success,
    ).toBe(true)
  })

  // The form makes a second key after an order that already exists was shown.
  it('makes a new valid key for the next order too', async () => {
    withoutRandomUuid()
    const added = { shortId: 'cccccc33', priceMinorSeen: 7000 }
    store([...TWO_BOOKS, added])
    const validate = vi
      .fn()
      .mockResolvedValue(
        answer([
          ok('aaaaaa11', 'První kniha', 18900),
          ok('bbbbbb22', 'Druhá kniha', 5000),
          ok('cccccc33', 'Třetí kniha', 7000),
        ]),
      )
    const submit = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: 'already_placed',
        publicToken: 'tok-old',
        shortIds: ['aaaaaa11', 'bbbbbb22'],
      })
      .mockResolvedValue({ ok: true, publicToken: 'tok-new' })
    renderForm({ submit, validate })
    await ready()
    fillContact()
    tickConsents()

    send()
    await screen.findByRole('alert')
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Odeslat objednávku',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    )
    send()
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))

    const first = submit.mock.calls[0][0].checkoutKey
    const second = submit.mock.calls[1][0].checkoutKey
    expect(z.uuid().safeParse(first).success).toBe(true)
    expect(z.uuid().safeParse(second).success).toBe(true)
    expect(second).not.toBe(first)
  })
})

// Helping the buyer choose a Zásilkovna pickup point (spec 6.5): a link to
// Packeta's own list and map, and a field that says what to write.
describe('CheckoutForm: finding a Zásilkovna pickup point', () => {
  async function chooseZasilkovna() {
    store(TWO_BOOKS)
    renderForm()
    await ready()
    fireEvent.click(screen.getByLabelText(/^Zásilkovna/))
  }

  it('links to the Zásilkovna list and map of pickup points', async () => {
    await chooseZasilkovna()

    const link = screen.getByRole('link', {
      name: /Najít výdejní místo na mapě Zásilkovny/,
    })
    expect(link.getAttribute('href')).toBe('https://www.zasilkovna.cz/pobocky')
  })

  // It leaves the shop, so it opens beside the form and the buyer comes back to
  // the form as they left it. Not handing our address over to the other site.
  it('opens that page in a new tab, safely', async () => {
    await chooseZasilkovna()

    const link = screen.getByRole('link', {
      name: /Najít výdejní místo na mapě Zásilkovny/,
    })
    expect(link.getAttribute('target')).toBe('_blank')
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/)
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
  })

  it('tells assistive technology that the link opens in a new window', async () => {
    await chooseZasilkovna()

    expect(
      screen.getByRole('link', { name: /otevře se v novém okně/ }),
    ).toBeTruthy()
  })

  it('says what to write in the field, with an example', async () => {
    await chooseZasilkovna()

    const field = screen.getByLabelText('Výdejní místo Zásilkovny')
    const hint = document.getElementById('checkout-point-hint')
    expect(hint?.textContent).toMatch(/název a adresu/)
    expect(hint?.textContent).toContain('Z-BOX Praha 1, Dlouhá 5')
    expect(field.getAttribute('aria-describedby')).toContain(
      'checkout-point-hint',
    )
    expect(field.getAttribute('placeholder')).toBe('Z-BOX Praha 1, Dlouhá 5')
  })

  it('keeps the field to the length the server accepts', async () => {
    await chooseZasilkovna()

    expect(
      screen
        .getByLabelText('Výdejní místo Zásilkovny')
        .getAttribute('maxlength'),
    ).toBe('200')
  })

  it('does not suggest what the browser might autofill', async () => {
    await chooseZasilkovna()

    expect(
      screen
        .getByLabelText('Výdejní místo Zásilkovny')
        .getAttribute('autocomplete'),
    ).toBe('off')
  })

  it('shows none of this for a personal pickup', async () => {
    store(TWO_BOOKS)
    renderForm()
    await ready()

    expect(
      screen.queryByRole('link', { name: /výdejní místo na mapě/i }),
    ).toBeNull()
    expect(screen.queryByLabelText('Výdejní místo Zásilkovny')).toBeNull()
  })

  it('does not send the form when the link is used', async () => {
    const submit = vi.fn()
    store(TWO_BOOKS)
    renderForm({ submit })
    await ready()
    fireEvent.click(screen.getByLabelText(/^Zásilkovna/))

    fireEvent.click(
      screen.getByRole('link', { name: /Najít výdejní místo na mapě/ }),
    )

    expect(submit).not.toHaveBeenCalled()
  })

  it('still asks for the pickup point before sending', async () => {
    const submit = vi.fn()
    store(TWO_BOOKS)
    renderForm({ submit })
    await ready()
    fillContact()
    tickConsents()
    fireEvent.click(screen.getByLabelText(/^Zásilkovna/))

    send()

    expect(
      await screen.findByText('Napište výdejní místo Zásilkovny.'),
    ).toBeTruthy()
    expect(submit).not.toHaveBeenCalled()
  })
})
