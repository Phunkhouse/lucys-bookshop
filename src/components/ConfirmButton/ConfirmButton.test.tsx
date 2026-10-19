import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { ConfirmButton } from './ConfirmButton'

// jsdom has no <dialog> methods. These stubs only toggle the open attribute,
// which is what makes the dialog visible to the tests.
const original = {
  showModal: HTMLDialogElement.prototype.showModal,
  close: HTMLDialogElement.prototype.close,
}

beforeEach(() => {
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

function renderButton(
  onConfirm: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
  disabled = false,
) {
  renderWithIntl(
    <ConfirmButton
      label="Zrušit objednávku"
      title="Zrušit objednávku?"
      text="Knihy se uvolní."
      confirmLabel="Ano, zrušit"
      pendingLabel="Ukládám…"
      cancelLabel="Zpět"
      onConfirm={onConfirm}
      disabled={disabled}
    />,
  )
  return onConfirm
}

const open = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Zrušit objednávku' }))

describe('ConfirmButton', () => {
  it('asks first and does nothing until the answer is yes', () => {
    const onConfirm = renderButton()

    expect(screen.queryByRole('dialog')).toBeNull()
    open()

    expect(
      screen.getByRole('dialog', { name: 'Zrušit objednávku?' }),
    ).toBeTruthy()
    expect(screen.getByText('Knihy se uvolní.')).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // A stray Enter must never confirm, so the safe choice has the focus.
  it('focuses the safe choice', () => {
    renderButton()
    open()

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Zpět' }),
    )
  })

  it('closes without calling anything on the safe choice', () => {
    const onConfirm = renderButton()
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Zpět' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('closes on a tap on the dimmed area', () => {
    const onConfirm = renderButton()
    open()

    fireEvent.click(screen.getByRole('dialog'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls once on yes, however often it is pressed, then closes', async () => {
    let finish: () => void = () => {}
    const onConfirm = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )
    renderButton(onConfirm)
    open()

    const yes = screen.getByRole('button', { name: 'Ano, zrušit' })
    fireEvent.click(yes)
    fireEvent.click(screen.getByRole('button', { name: 'Ukládám…' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(
      (screen.getByRole('button', { name: 'Ukládám…' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    finish()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  // Esc is the dialog's own cancel event. Mid-request it must not close the
  // dialog, or the seller loses the "Ukládám…" feedback.
  it('ignores Esc while the action runs, and honours it otherwise', async () => {
    let finish: () => void = () => {}
    renderButton(
      vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    )
    open()
    const dialog = screen.getByRole('dialog')

    // Not running: Esc is allowed to close it.
    expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ano, zrušit' }))
    expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(
      false,
    )

    finish()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes and stays usable when the action throws', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'))
    renderButton(onConfirm)
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Ano, zrušit' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      (
        screen.getByRole('button', {
          name: 'Zrušit objednávku',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('does not open while disabled', () => {
    renderButton(undefined, true)

    expect(
      (
        screen.getByRole('button', {
          name: 'Zrušit objednávku',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
})
