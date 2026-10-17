import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { BookForm } from './BookForm'

const { push, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

const genres = ['novel', 'crime', 'scifi']

beforeEach(() => {
  vi.clearAllMocks()
})

type FormProps = Parameters<typeof BookForm>[0]

const fakeUpload = vi.fn()

function renderForm(
  action = vi.fn().mockResolvedValue({ ok: true }),
  initialValues?: FormProps['initialValues'],
  extra: Partial<FormProps> = {},
) {
  renderWithIntl(
    <BookForm
      genres={genres}
      action={action}
      initialValues={initialValues}
      upload={fakeUpload}
      {...extra}
    />,
  )
  return action
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

function fillRequired() {
  type('Název', 'Stíny nad Vltavou')
  type('Autor', 'Marta Hrubešová')
  type('Cena (Kč)', '189,50')
}

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Uložit' }))

function descriptionOf(field: HTMLElement) {
  const id = field.getAttribute('aria-describedby')
  return id ? document.getElementById(id)?.textContent : undefined
}

describe('BookForm fields', () => {
  it('has a labelled field for everything the seller enters', () => {
    renderForm()

    for (const label of [
      'Název',
      'Autor',
      'Jazyk',
      'Poznámka ke stavu',
      'Popis',
      'Cena (Kč)',
      'ISBN',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    expect(screen.getByRole('group', { name: 'Žánry' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Stav' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Detektivka' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Jako nová' })).toBeTruthy()
  })

  it('starts a new book in Czech and as used, and asks for the price with a decimal keypad', () => {
    renderForm()

    expect((screen.getByLabelText('Jazyk') as HTMLSelectElement).value).toBe(
      'cs',
    )
    expect(
      (screen.getByRole('radio', { name: 'Použitá' }) as HTMLInputElement)
        .checked,
    ).toBe(true)
    expect(screen.getByLabelText('Cena (Kč)').getAttribute('inputmode')).toBe(
      'decimal',
    )
  })

  it('shows the values of the book being edited', () => {
    renderForm(undefined, {
      title: 'Stíny',
      author: 'Autor',
      genres: ['crime'],
      language: 'en',
      condition: 'like_new',
      conditionNote: 'Bez poznámek',
      description: 'Popis',
      price: '189,50',
      isbn: '9780306406157',
    })

    expect((screen.getByLabelText('Název') as HTMLInputElement).value).toBe(
      'Stíny',
    )
    expect((screen.getByLabelText('Jazyk') as HTMLSelectElement).value).toBe(
      'en',
    )
    expect((screen.getByLabelText('Cena (Kč)') as HTMLInputElement).value).toBe(
      '189,50',
    )
    expect(
      (screen.getByRole('checkbox', { name: 'Detektivka' }) as HTMLInputElement)
        .checked,
    ).toBe(true)
    expect(
      (screen.getByRole('checkbox', { name: 'Román' }) as HTMLInputElement)
        .checked,
    ).toBe(false)
    expect(
      (screen.getByRole('radio', { name: 'Jako nová' }) as HTMLInputElement)
        .checked,
    ).toBe(true)
  })
})

describe('BookForm validation', () => {
  it('shows linked errors for missing fields, does not call the action, and focuses the first', async () => {
    const action = renderForm()

    submit()

    const title = screen.getByLabelText('Název')
    await waitFor(() => expect(title.getAttribute('aria-invalid')).toBe('true'))
    expect(descriptionOf(title)).toBe('Vyplňte toto pole.')
    expect(descriptionOf(screen.getByLabelText('Autor'))).toBe(
      'Vyplňte toto pole.',
    )
    expect(descriptionOf(screen.getByLabelText('Cena (Kč)'))).toBe(
      'Vyplňte toto pole.',
    )
    expect(document.activeElement).toBe(title)
    expect(action).not.toHaveBeenCalled()
  })

  it('explains a price that is not a number', async () => {
    const action = renderForm()
    fillRequired()
    type('Cena (Kč)', 'abc')

    submit()

    await waitFor(() =>
      expect(descriptionOf(screen.getByLabelText('Cena (Kč)'))).toBe(
        'Zadejte cenu číslem, například 189 nebo 189,50.',
      ),
    )
    expect(action).not.toHaveBeenCalled()
  })
})

describe('BookForm saving', () => {
  it('sends the values as typed, then goes back to the list', async () => {
    const action = renderForm()
    fillRequired()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Detektivka' }))

    submit()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin'))
    expect(action).toHaveBeenCalledWith({
      title: 'Stíny nad Vltavou',
      author: 'Marta Hrubešová',
      genres: ['crime'],
      language: 'cs',
      condition: 'used',
      conditionNote: '',
      description: '',
      price: '189,50',
      isbn: '',
      photos: [],
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('disables the button while saving', async () => {
    let finish: (value: { ok: true }) => void = () => {}
    const action = vi.fn(
      () => new Promise<{ ok: true }>((resolve) => (finish = resolve)),
    )
    renderForm(action)
    fillRequired()

    submit()

    const button = await screen.findByRole('button', { name: 'Ukládám…' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    finish({ ok: true })
    await waitFor(() => expect(push).toHaveBeenCalled())
  })

  it('shows errors the server found next to their fields and stays on the page', async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      errors: { title: 'tooLong', genres: 'unknownGenre' },
    })
    renderForm(action)
    fillRequired()

    submit()

    await waitFor(() =>
      expect(descriptionOf(screen.getByLabelText('Název'))).toBe(
        'Text je příliš dlouhý.',
      ),
    )
    expect(screen.getByText('Vybraný žánr neexistuje.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('tells the seller when saving fails altogether', async () => {
    const action = vi.fn().mockRejectedValue(new Error('network'))
    renderForm(action)
    fillRequired()

    submit()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Uložení se nepodařilo. Zkuste to prosím znovu.',
    )
    expect(push).not.toHaveBeenCalled()
  })
})

describe('BookForm photos', () => {
  const photos = [
    { imageId: 'img-1', previewUrl: 'https://img.test/1/thumb.jpg' },
    { imageId: 'img-2', previewUrl: 'https://img.test/2/thumb.jpg' },
  ]
  const file = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' })
  const addPhoto = () =>
    fireEvent.change(screen.getByLabelText('Přidat fotky'), {
      target: { files: [file()] },
    })

  beforeEach(() => {
    fakeUpload.mockReset()
  })

  it('has a Fotky section with the counter', () => {
    renderForm()

    expect(screen.getByRole('group', { name: 'Fotky' })).toBeTruthy()
    expect(screen.getByText('0 z 5')).toBeTruthy()
  })

  it('blocks Save, and says why, while a photo is uploading', async () => {
    fakeUpload.mockReturnValue(new Promise(() => {}))
    renderForm()
    fillRequired()

    addPhoto()

    // The photo section reports to the form one render later, so wait for it.
    expect(
      await screen.findByText('Počkejte, až se fotky nahrají.'),
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Uložit' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('blocks Save, and says why, while a photo has failed', async () => {
    fakeUpload.mockResolvedValue({ ok: false, error: 'uploadFailed' })
    renderForm()
    fillRequired()

    addPhoto()

    await screen.findByText('Nahrání se nepovedlo. Zkuste to znovu.')
    // The form hears about the failure one render later, so wait for it.
    expect(
      await screen.findByText('Odstraňte nebo zopakujte nepovedené fotky.'),
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Uložit' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('sends the finished photos with the form, in order', async () => {
    fakeUpload.mockResolvedValue({
      ok: true,
      uploadId: 'u1',
      previewUrl: 'blob:u1',
    })
    const action = renderForm()
    fillRequired()
    addPhoto()
    await screen.findByText('Připraveno')
    // Save is open again only when the form has heard that the photo is ready.
    await waitFor(() =>
      expect(screen.queryByText('Počkejte, až se fotky nahrají.')).toBeNull(),
    )

    submit()

    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(action.mock.calls[0][0].photos).toEqual([
      { kind: 'new', uploadId: 'u1' },
    ])
  })

  it('sends an empty list for a book without photos', async () => {
    const action = renderForm()
    fillRequired()

    submit()

    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(action.mock.calls[0][0].photos).toEqual([])
  })

  it('shows the existing photos when editing, and sends them unchanged if nobody touches them', async () => {
    const action = renderForm(
      undefined,
      {
        title: 'Stíny',
        author: 'Autor',
        genres: [],
        language: 'cs',
        condition: 'used',
        conditionNote: '',
        description: '',
        price: '189',
        isbn: '',
      },
      { photos },
    )
    expect(screen.getByText('2 z 5')).toBeTruthy()

    submit()

    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(action.mock.calls[0][0].photos).toEqual([
      { kind: 'existing', imageId: 'img-1' },
      { kind: 'existing', imageId: 'img-2' },
    ])
  })

  it.each([
    [
      'photoInvalid',
      'Některá fotka není v pořádku. Odstraňte ji a nahrajte znovu.',
    ],
    ['tooManyPhotos', 'Fotek je příliš mnoho. Nejvíc je 5.'],
    ['photoMissing', 'Nahrávání fotky vypršelo. Nahrajte ji znovu.'],
  ])(
    'shows the server problem %s in the photo section',
    async (key, message) => {
      const action = vi
        .fn()
        .mockResolvedValue({ ok: false, errors: { photos: key } })
      renderForm(action)
      fillRequired()

      submit()

      expect(await screen.findByText(message)).toBeTruthy()
      expect(push).not.toHaveBeenCalled()
    },
  )
})
