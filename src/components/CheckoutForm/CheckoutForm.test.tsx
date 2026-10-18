import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_STORAGE_KEY } from '@/lib/cart-store'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { CheckoutResult } from '@/server/checkout'
import type { CartValidation } from '@/server/cart'
import type { CartLine } from '@/server/cart-rules'
import { CheckoutForm } from './CheckoutForm'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('@/i18n/navigation', async () => ({
  ...(await vi.importActual<typeof import('@/i18n/navigation')>(
    '@/i18n/navigation',
  )),
  useRouter: () => ({ push }),
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
      })
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
