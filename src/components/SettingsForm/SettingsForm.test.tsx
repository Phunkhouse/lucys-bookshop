import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { SettingsForm } from './SettingsForm'

function renderForm(
  action = vi.fn().mockResolvedValue({ ok: true }),
  initialValues = { zasilkovnaPrice: '89', pickupInstructions: 'Na Příkopě 1' },
) {
  renderWithIntl(<SettingsForm action={action} initialValues={initialValues} />)
  return action
}

// The error is the first id in aria-describedby; the hint follows it.
const errorOf = (field: HTMLElement) =>
  document.getElementById(field.getAttribute('aria-describedby')!.split(' ')[0])
    ?.textContent

const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Uložit' }))
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('SettingsForm', () => {
  it('shows labelled fields with the saved values and the hint about no price', () => {
    renderForm()

    const price = screen.getByLabelText('Cena Zásilkovny (Kč)')
    expect((price as HTMLInputElement).value).toBe('89')
    expect(price.getAttribute('inputmode')).toBe('decimal')
    expect(
      (screen.getByLabelText('Pokyny k osobnímu odběru') as HTMLTextAreaElement)
        .value,
    ).toBe('Na Příkopě 1')
    expect(
      screen.getByText(/Bez ceny se Zásilkovna v objednávce nenabízí/),
    ).toBeTruthy()
  })

  it('sends the typed text as it is and confirms the save', async () => {
    const action = renderForm()
    type('Cena Zásilkovny (Kč)', '')

    save()

    expect((await screen.findByRole('status')).textContent).toBe(
      'Nastavení uloženo.',
    )
    expect(action).toHaveBeenCalledWith({
      zasilkovnaPrice: '',
      pickupInstructions: 'Na Příkopě 1',
    })
  })

  it('shows a price error tied to its field and does not call the server', async () => {
    const action = renderForm()
    type('Cena Zásilkovny (Kč)', 'abc')

    save()

    const field = await screen.findByLabelText('Cena Zásilkovny (Kč)')
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
    expect(errorOf(field)).toMatch(/Zadejte cenu číslem/)
    expect(action).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a server error on its field', async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      errors: { pickupInstructions: 'tooLong' },
    })
    renderForm(action)

    save()

    const field = await screen.findByLabelText('Pokyny k osobnímu odběru')
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
    expect(errorOf(field)).toBe('Text je příliš dlouhý.')
  })

  it('tells the seller when saving fails', async () => {
    renderForm(vi.fn().mockRejectedValue(new Error('down')))

    save()

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Uložení se nepodařilo/,
    )
  })
})
