import { fireEvent, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/cs.json'
import { renderWithIntl } from '@/lib/render-with-intl'
import { DeleteBookButton } from './DeleteBookButton'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

// jsdom has no <dialog> methods. These stubs only toggle the open attribute,
// which is what makes the dialog visible to the tests.
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

const TITLE = 'Stíny nad Vltavou'

function renderButton(
  deleteBook = vi.fn().mockResolvedValue({ outcome: 'deleted', imageKeys: [] }),
  status: 'available' | 'reserved' | 'sold' | 'hidden' = 'hidden',
) {
  renderWithIntl(
    <DeleteBookButton status={status} title={TITLE} deleteBook={deleteBook} />,
  )
  return deleteBook
}

const open = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Smazat' }))
const confirm = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Ano, smazat' }))

describe('DeleteBookButton', () => {
  it('offers Smazat on a hidden book, with nothing open yet', () => {
    renderButton()

    expect(screen.getByRole('button', { name: 'Smazat' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['available', 'reserved', 'sold'] as const)(
    'offers nothing for a %s book',
    (status) => {
      renderButton(undefined, status)

      expect(screen.queryByRole('button')).toBeNull()
    },
  )

  it('asks first, naming the book, and deletes nothing yet', () => {
    const deleteBook = renderButton()

    open()

    const dialog = screen.getByRole('dialog', { name: 'Smazat knihu?' })
    expect(dialog.textContent).toContain('„Stíny nad Vltavou“')
    expect(screen.getByRole('button', { name: 'Ano, smazat' })).toBeTruthy()
    expect(deleteBook).not.toHaveBeenCalled()
  })

  it('puts the cursor on Zrušit, so a stray Enter cannot delete', () => {
    renderButton()

    open()

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Zrušit' }),
    )
  })

  it('closes with Zrušit and does not call the action', () => {
    const deleteBook = renderButton()
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(deleteBook).not.toHaveBeenCalled()
  })

  it('deletes once even when Ano, smazat is pressed twice, and refreshes the list', async () => {
    let finish: (value: {
      outcome: 'deleted'
      imageKeys: string[]
    }) => void = () => {}
    const deleteBook = vi.fn(
      () =>
        new Promise<{ outcome: 'deleted'; imageKeys: string[] }>(
          (resolve) => (finish = resolve),
        ),
    )
    renderButton(deleteBook)
    open()

    confirm()
    const busy = await screen.findByRole('button', { name: 'Mažu…' })
    fireEvent.click(busy)
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    finish({ outcome: 'deleted', imageKeys: [] })

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(deleteBook).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['not_hidden', 'Knihu nejdřív skryjte, pak ji půjde smazat.'],
    ['reserved', 'Kniha je rezervovaná, smazat ji nejde.'],
    ['sold', 'Prodané knihy se nemažou, jejich odkaz musí dál fungovat.'],
    ['has_orders', 'Kniha je v objednávce, smazat ji nejde.'],
    ['not_found', 'Tuto knihu se nepodařilo najít.'],
  ] as const)(
    'explains a refusal (%s), closes the dialog and refreshes',
    async (reason, message) => {
      const deleteBook = vi
        .fn()
        .mockResolvedValue({ outcome: 'refused', reason })
      renderButton(deleteBook)
      open()

      confirm()

      expect((await screen.findByRole('alert')).textContent).toBe(message)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(refresh).toHaveBeenCalled()
    },
  )

  it('keeps showing the refusal after the page refresh turns the book into a non-hidden one', async () => {
    const deleteBook = vi
      .fn()
      .mockResolvedValue({ outcome: 'refused', reason: 'not_hidden' })
    const { rerender } = renderWithIntl(
      <DeleteBookButton
        status="hidden"
        title={TITLE}
        deleteBook={deleteBook}
      />,
    )
    open()
    confirm()
    await screen.findByRole('alert')

    // What the refreshed page does: the same row, now with the real status.
    rerender(
      <NextIntlClientProvider locale="cs" messages={messages}>
        <DeleteBookButton
          status="available"
          title={TITLE}
          deleteBook={deleteBook}
        />
      </NextIntlClientProvider>,
    )

    expect(screen.getByRole('alert').textContent).toBe(
      'Knihu nejdřív skryjte, pak ji půjde smazat.',
    )
  })

  it('tells the seller when deleting fails altogether', async () => {
    renderButton(vi.fn().mockRejectedValue(new Error('network')))
    open()

    confirm()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Smazání se nepodařilo. Zkuste to prosím znovu.',
    )
    expect(refresh).not.toHaveBeenCalled()
  })

  it('still opens where the browser has no showModal, just not as a modal', () => {
    // @ts-expect-error simulating an old browser
    HTMLDialogElement.prototype.showModal = undefined
    renderButton()

    open()

    expect(screen.getByRole('dialog', { name: 'Smazat knihu?' })).toBeTruthy()
  })
})
