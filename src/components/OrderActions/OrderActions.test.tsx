import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import type { OrderActionSet } from '@/server/admin/order-actions'
import { OrderActions } from './OrderActions'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const original = {
  showModal: HTMLDialogElement.prototype.showModal,
  close: HTMLDialogElement.prototype.close,
}

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

afterEach(() => {
  HTMLDialogElement.prototype.showModal = original.showModal
  HTMLDialogElement.prototype.close = original.close
})

const none: OrderActionSet = {
  markPaid: false,
  cancel: false,
  extend: false,
  ship: false,
  fixTracking: false,
  complete: false,
  refund: false,
}
const only = (...on: (keyof OrderActionSet)[]): OrderActionSet => ({
  ...none,
  ...Object.fromEntries(on.map((key) => [key, true])),
})

function handlers() {
  return {
    markPaid: vi.fn().mockResolvedValue({ outcome: 'paid' }),
    cancel: vi.fn().mockResolvedValue({ outcome: 'cancelled' }),
    refund: vi.fn().mockResolvedValue({ outcome: 'refunded' }),
    extend: vi.fn().mockResolvedValue({
      outcome: 'extended',
      expiresAt: new Date('2026-10-21T12:00:00.000Z'),
    }),
    markShipped: vi.fn().mockResolvedValue({ outcome: 'shipped' }),
    setTracking: vi.fn().mockResolvedValue({ outcome: 'saved' }),
    complete: vi.fn().mockResolvedValue({ outcome: 'completed' }),
    setNote: vi.fn().mockResolvedValue({ outcome: 'saved' }),
  }
}

function render(
  actions: OrderActionSet,
  h = handlers(),
  extra: { trackingNumber?: string | null; note?: string | null } = {},
) {
  renderWithIntl(
    <OrderActions
      actions={actions}
      trackingNumber={extra.trackingNumber ?? null}
      note={extra.note ?? null}
      {...h}
    />,
  )
  return h
}

const button = (name: string) => screen.getByRole('button', { name })
const click = (name: string) => fireEvent.click(button(name))

describe('OrderActions: which buttons show', () => {
  it('shows only what is allowed, and always the note', () => {
    render(only('markPaid', 'cancel'))

    expect(button('Označit jako zaplacené')).toBeTruthy()
    expect(button('Zrušit objednávku')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Vrátit peníze' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Prodloužit/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /odeslané/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /vyřízené/ })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Poznámka' })).toBeTruthy()
  })

  it('shows nothing but the note for a finished order', () => {
    render(none)

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Uložit poznámku',
    ])
  })

  it('shows the rest when they are allowed', () => {
    render(only('extend', 'ship', 'complete', 'refund'))

    expect(button('Prodloužit rezervaci o 48 h')).toBeTruthy()
    expect(button('Označit jako odeslané')).toBeTruthy()
    expect(button('Označit jako vyřízené')).toBeTruthy()
    expect(button('Vrátit peníze')).toBeTruthy()
  })
})

describe('OrderActions: confirmed actions', () => {
  it.each([
    ['markPaid', 'Označit jako zaplacené', 'Ano, zaplaceno'],
    ['cancel', 'Zrušit objednávku', 'Ano, zrušit'],
    ['refund', 'Vrátit peníze', 'Ano, vráceno'],
  ] as const)(
    'asks before %s, and calls it once on yes',
    async (key, open, yes) => {
      const h = render(only(key))

      click(open)
      expect(h[key]).not.toHaveBeenCalled()
      click(yes)

      await waitFor(() => expect(refresh).toHaveBeenCalled())
      expect(h[key]).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    ['markPaid', 'Označit jako zaplacené'],
    ['cancel', 'Zrušit objednávku'],
    ['refund', 'Vrátit peníze'],
  ] as const)('calls nothing when %s is declined', (key, open) => {
    const h = render(only(key))

    click(open)
    fireEvent.click(screen.getByRole('button', { name: 'Zpět' }))

    expect(h[key]).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('calls once however often yes is pressed', async () => {
    let finish: (value: unknown) => void = () => {}
    const h = handlers()
    h.markPaid.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(only('markPaid'), h)

    click('Označit jako zaplacené')
    click('Ano, zaplaceno')
    fireEvent.click(screen.getByRole('button', { name: 'Ukládám…' }))

    expect(h.markPaid).toHaveBeenCalledTimes(1)
    finish({ outcome: 'paid' })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })
})

describe('OrderActions: one-click actions', () => {
  it('extends the reservation', async () => {
    const h = render(only('extend'))

    click('Prodloužit rezervaci o 48 h')

    await waitFor(() => expect(h.extend).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('completes the order', async () => {
    const h = render(only('complete'))

    click('Označit jako vyřízené')

    await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(1))
  })

  it('keeps every other button disabled while one action runs', async () => {
    let finish: (value: unknown) => void = () => {}
    const h = handlers()
    h.extend.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(only('extend', 'complete'), h)

    click('Prodloužit rezervaci o 48 h')

    expect(
      (button('Označit jako vyřízené') as HTMLButtonElement).disabled,
    ).toBe(true)
    finish({ outcome: 'extended', expiresAt: new Date() })
    await waitFor(() =>
      expect(
        (button('Označit jako vyřízené') as HTMLButtonElement).disabled,
      ).toBe(false),
    )
  })
})

describe('OrderActions: what went wrong', () => {
  it('says so when the order cannot be changed any more', async () => {
    const h = handlers()
    h.cancel.mockResolvedValue({
      outcome: 'refused',
      reason: 'not_cancellable',
    })
    render(only('cancel'), h)

    click('Zrušit objednávku')
    click('Ano, zrušit')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Tuto objednávku už zrušit nejde.',
    )
    // Refreshed all the same, so a stale page corrects itself.
    expect(refresh).toHaveBeenCalled()
  })

  it('names the books that went to someone else', async () => {
    const h = handlers()
    h.markPaid.mockResolvedValue({
      outcome: 'conflict',
      books: [
        { id: 'b1', title: 'Saturnin', reason: 'reserved' },
        { id: 'b2', title: 'Babička', reason: 'sold' },
      ],
    })
    render(only('markPaid'), h)

    click('Označit jako zaplacené')
    click('Ano, zaplaceno')

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Saturnin/)).toBeTruthy()
    expect(within(alert).getByText(/Babička/)).toBeTruthy()
  })

  it('shows no message when nothing needed changing', async () => {
    const h = handlers()
    h.complete.mockResolvedValue({ outcome: 'unchanged' })
    render(only('complete'), h)

    click('Označit jako vyřízené')

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says the action failed when the call throws, and stays usable', async () => {
    const h = handlers()
    h.complete.mockRejectedValueOnce(new Error('offline'))
    render(only('complete'), h)

    click('Označit jako vyřízené')

    expect((await screen.findByRole('alert')).textContent).toMatch(/nepodařila/)
    await waitFor(() =>
      expect(
        (button('Označit jako vyřízené') as HTMLButtonElement).disabled,
      ).toBe(false),
    )
  })

  it('clears an old message after a successful action', async () => {
    const h = handlers()
    h.complete
      .mockResolvedValueOnce({ outcome: 'refused', reason: 'not_completable' })
      .mockResolvedValueOnce({ outcome: 'completed' })
    render(only('complete'), h)

    click('Označit jako vyřízené')
    await screen.findByRole('alert')
    click('Označit jako vyřízené')

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('OrderActions: tracking number', () => {
  it('will not ship without a number', () => {
    const h = render(only('ship'))

    fireEvent.change(screen.getByLabelText('Číslo zásilky'), {
      target: { value: '   ' },
    })
    click('Označit jako odeslané')

    expect(screen.getByRole('alert').textContent).toMatch(/číslo zásilky/i)
    expect(h.markShipped).not.toHaveBeenCalled()
  })

  it('ships with the trimmed number', async () => {
    const h = render(only('ship'))

    fireEvent.change(screen.getByLabelText('Číslo zásilky'), {
      target: { value: '  Z123 456  ' },
    })
    click('Označit jako odeslané')

    await waitFor(() => expect(h.markShipped).toHaveBeenCalledWith('Z123 456'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows the current number and saves a correction', async () => {
    const h = render(only('fixTracking'), handlers(), {
      trackingNumber: 'Z111',
    })

    const field = screen.getByLabelText('Číslo zásilky') as HTMLInputElement
    expect(field.value).toBe('Z111')
    fireEvent.change(field, { target: { value: ' Z222 ' } })
    click('Uložit číslo zásilky')

    await waitFor(() => expect(h.setTracking).toHaveBeenCalledWith('Z222'))
  })
})

describe('OrderActions: tracking number confirmation', () => {
  it('confirms that the corrected number was saved', async () => {
    render(only('fixTracking'), handlers(), { trackingNumber: 'Z111' })

    click('Uložit číslo zásilky')

    expect((await screen.findByRole('status')).textContent).toBe('Uloženo')
  })

  it('does not confirm when the number was refused', async () => {
    const h = handlers()
    h.setTracking.mockResolvedValue({
      outcome: 'refused',
      reason: 'invalid_tracking',
    })
    render(only('fixTracking'), h, { trackingNumber: 'Z111' })

    click('Uložit číslo zásilky')

    await screen.findByRole('alert')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('forgets "Uloženo" as soon as the number is edited again', async () => {
    render(only('fixTracking'), handlers(), { trackingNumber: 'Z111' })
    click('Uložit číslo zásilky')
    await screen.findByRole('status')

    fireEvent.change(screen.getByLabelText('Číslo zásilky'), {
      target: { value: 'Z222' },
    })

    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('OrderActions: note', () => {
  it('shows the current note and saves the trimmed text', async () => {
    const h = render(none, handlers(), { note: 'stará' })

    const field = screen.getByRole('textbox', {
      name: 'Poznámka',
    }) as HTMLTextAreaElement
    expect(field.value).toBe('stará')
    fireEvent.change(field, { target: { value: '  nová poznámka ' } })
    click('Uložit poznámku')

    await waitFor(() => expect(h.setNote).toHaveBeenCalledWith('nová poznámka'))
  })

  it('confirms that it saved', async () => {
    render(none)

    click('Uložit poznámku')

    expect((await screen.findByRole('status')).textContent).toBe('Uloženo')
  })

  it('says when the note is too long', async () => {
    const h = handlers()
    h.setNote.mockResolvedValue({ outcome: 'refused', reason: 'invalid_note' })
    render(none, h)

    click('Uložit poznámku')

    expect((await screen.findByRole('alert')).textContent).toMatch(/2000/)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('forgets "Uloženo" as soon as the text is edited again', async () => {
    render(none)
    click('Uložit poznámku')
    await screen.findByRole('status')

    fireEvent.change(screen.getByRole('textbox', { name: 'Poznámka' }), {
      target: { value: 'další' },
    })

    expect(screen.queryByRole('status')).toBeNull()
  })
})
