import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { PhotoPicker } from './PhotoPicker'

type Outcome =
  | { ok: true; uploadId: string; previewUrl: string }
  | {
      ok: false
      error: 'unreadable' | 'tooLarge' | 'tooExtreme' | 'uploadFailed'
    }

// Every call to upload() waits until the test resolves it, so the tests decide
// when and in which order photos finish.
let pending: {
  file: File
  signal: AbortSignal
  resolve: (o: Outcome) => void
}[]
const upload = vi.fn(
  (file: File, signal: AbortSignal) =>
    new Promise<Outcome>((resolve) => pending.push({ file, signal, resolve })),
)
const onChange = vi.fn()

beforeEach(() => {
  pending = []
  vi.clearAllMocks()
})

const existing = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    imageId: `img-${i + 1}`,
    previewUrl: `https://img.test/${i + 1}/thumb.jpg`,
  }))

function renderPicker(initialPhotos = existing(0)) {
  return renderWithIntl(
    <PhotoPicker
      initialPhotos={initialPhotos}
      upload={upload}
      onChange={onChange}
    />,
  )
}

const files = (...names: string[]) =>
  names.map((name) => new File(['x'], name, { type: 'image/jpeg' }))
const pick = (...names: string[]) =>
  fireEvent.change(screen.getByLabelText('Přidat fotky'), {
    target: { files: files(...names) },
  })
const state = () => onChange.mock.calls.at(-1)![0]
const finish = async (index: number, outcome: Outcome) => {
  await act(async () => pending[index].resolve(outcome))
}
const ready = (id: string): Outcome => ({
  ok: true,
  uploadId: id,
  previewUrl: `blob:${id}`,
})

describe('PhotoPicker: adding', () => {
  it('shows the counter and a picker that offers camera or library, several at a time', () => {
    renderPicker()

    const input = screen.getByLabelText('Přidat fotky') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('image/*')
    expect(input.multiple).toBe(true)
    expect(input.hasAttribute('capture')).toBe(false)
    expect(screen.getByText('0 z 5')).toBeTruthy()
  })

  it('shows a tile per chosen file while it uploads, and reports only finished photos, in tile order', async () => {
    renderPicker()

    pick('a.jpg', 'b.jpg')

    expect(screen.getAllByText('Nahrávám…')).toHaveLength(2)
    expect(state()).toMatchObject({ entries: [], busy: true })

    // The photos are processed one after another; the second starts when the first is done.
    await finish(0, ready('u1'))
    await waitFor(() => expect(pending).toHaveLength(2))
    await finish(1, ready('u2'))

    await waitFor(() => expect(state().busy).toBe(false))
    expect(state().entries).toEqual([
      { kind: 'new', uploadId: 'u1' },
      { kind: 'new', uploadId: 'u2' },
    ])
    expect(screen.getAllByText('Připraveno')).toHaveLength(2)
    expect(
      screen.getAllByRole('img').map((i) => i.getAttribute('src')),
    ).toEqual(['blob:u1', 'blob:u2'])
  })

  it('processes photos one at a time', async () => {
    renderPicker()

    pick('a.jpg', 'b.jpg', 'c.jpg')

    expect(upload).toHaveBeenCalledTimes(1)
    await finish(0, ready('u1'))
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
    expect(pending).toHaveLength(2)
  })

  it('fills only the free slots when more files are chosen, and says so', async () => {
    renderPicker(existing(3))

    pick('a.jpg', 'b.jpg', 'c.jpg', 'd.jpg')

    expect(screen.getByRole('status').textContent).toContain(
      'Přidáno jen 2. Nejvíc je 5 fotek.',
    )
    expect(screen.getByText('5 z 5')).toBeTruthy()
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('disables adding at five photos', () => {
    renderPicker(existing(5))

    expect(
      (screen.getByLabelText('Přidat fotky') as HTMLInputElement).disabled,
    ).toBe(true)
  })
})

describe('PhotoPicker: existing photos', () => {
  it('shows them with their previews and readable names', () => {
    renderPicker(existing(3))

    const list = screen.getByRole('list', { name: 'Fotky' })
    const tiles = within(list).getAllByRole('listitem')
    expect(tiles).toHaveLength(3)
    expect(within(tiles[1]).getByText('Fotka 2 z 3')).toBeTruthy()
    const image = within(tiles[1]).getByRole('img')
    expect(image.getAttribute('src')).toBe('https://img.test/2/thumb.jpg')
    expect(image.getAttribute('alt')).toBe('Náhled fotky 2')
  })
})

describe('PhotoPicker: order', () => {
  it('moves a photo earlier or later, reports the new order, and announces it', () => {
    renderPicker(existing(3))

    fireEvent.click(
      screen.getByRole('button', { name: 'Posunout fotku 2 dopředu' }),
    )

    expect(state().entries).toEqual([
      { kind: 'existing', imageId: 'img-2' },
      { kind: 'existing', imageId: 'img-1' },
      { kind: 'existing', imageId: 'img-3' },
    ])
    expect(screen.getByRole('status').textContent).toContain(
      'Fotka přesunuta na pozici 1 z 3.',
    )
  })

  it('has no "earlier" on the first photo and no "later" on the last', () => {
    renderPicker(existing(3))

    expect(
      screen.queryByRole('button', { name: 'Posunout fotku 1 dopředu' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Posunout fotku 3 dozadu' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Posunout fotku 1 dozadu' }),
    ).toBeTruthy()
  })

  it('keeps the keyboard focus on the moved photo, on the same direction while it can go further', () => {
    renderPicker(existing(3))

    // Photo 2 goes first and cannot go further forward: focus moves to "later".
    fireEvent.click(
      screen.getByRole('button', { name: 'Posunout fotku 2 dopředu' }),
    )
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Posunout fotku 1 dozadu' }),
    )

    // Pressing "later" again keeps focus on "later", so it can be pressed again.
    fireEvent.click(
      screen.getByRole('button', { name: 'Posunout fotku 1 dozadu' }),
    )
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Posunout fotku 2 dozadu' }),
    )

    // At the end there is no further "later": focus moves to "earlier".
    fireEvent.click(
      screen.getByRole('button', { name: 'Posunout fotku 2 dozadu' }),
    )
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Posunout fotku 3 dopředu' }),
    )
  })
})

describe('PhotoPicker: removing and replacing', () => {
  it('removes a photo, updates the counter and the list, and announces it', () => {
    renderPicker(existing(3))

    fireEvent.click(screen.getByRole('button', { name: 'Odstranit fotku 2' }))

    expect(screen.getByText('2 z 5')).toBeTruthy()
    expect(state().entries).toEqual([
      { kind: 'existing', imageId: 'img-1' },
      { kind: 'existing', imageId: 'img-3' },
    ])
    expect(screen.getByRole('status').textContent).toContain(
      'Fotka odstraněna.',
    )
  })

  it('stops an upload that is still running when its photo is removed', () => {
    renderPicker()
    pick('a.jpg')
    expect(pending[0].signal.aborted).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Odstranit fotku 1' }))

    expect(pending[0].signal.aborted).toBe(true)
    expect(state()).toMatchObject({ entries: [], busy: false })
  })

  it('replaces a photo in place: the new one takes its position, the old one drops out', async () => {
    renderPicker(existing(3))

    fireEvent.change(screen.getByLabelText('Nahradit fotku 2'), {
      target: { files: files('new.jpg') },
    })
    expect(state().busy).toBe(true)
    await finish(0, ready('u9'))

    await waitFor(() => expect(state().busy).toBe(false))
    expect(state().entries).toEqual([
      { kind: 'existing', imageId: 'img-1' },
      { kind: 'new', uploadId: 'u9' },
      { kind: 'existing', imageId: 'img-3' },
    ])
    expect(screen.getByText('3 z 5')).toBeTruthy()
  })

  it('keeps the old photo when its replacement fails, and says why', async () => {
    renderPicker(existing(2))

    fireEvent.change(screen.getByLabelText('Nahradit fotku 1'), {
      target: { files: files('new.jpg') },
    })
    await finish(0, { ok: false, error: 'uploadFailed' })

    expect(
      await screen.findByText('Nahrání se nepovedlo. Zkuste to znovu.'),
    ).toBeTruthy()
    expect(state().entries).toEqual([
      { kind: 'existing', imageId: 'img-1' },
      { kind: 'existing', imageId: 'img-2' },
    ])
  })
})

describe('PhotoPicker: failures', () => {
  it.each([
    [
      'unreadable',
      'Tuto fotku nejde přečíst. Zkuste ji uložit jako JPEG nebo ji nahrát z telefonu.',
    ],
    ['tooLarge', 'Fotka je i po zmenšení příliš velká.'],
    ['tooExtreme', 'Fotka má příliš protáhlý tvar.'],
    ['uploadFailed', 'Nahrání se nepovedlo. Zkuste to znovu.'],
  ] as const)(
    'shows why a photo failed (%s), and keeps it out of the list',
    async (error, message) => {
      renderPicker()
      pick('a.jpg')

      await finish(0, { ok: false, error })

      expect(await screen.findByText(message)).toBeTruthy()
      expect(state()).toMatchObject({ entries: [], busy: false, failed: true })
    },
  )

  it('retries a failed photo with the same file', async () => {
    renderPicker()
    pick('a.jpg')
    await finish(0, { ok: false, error: 'uploadFailed' })
    await screen.findByRole('button', { name: 'Zkusit znovu' })

    fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }))

    await waitFor(() => expect(pending).toHaveLength(2))
    expect(pending[1].file).toBe(pending[0].file)
    await finish(1, ready('u1'))
    await waitFor(() => expect(state().failed).toBe(false))
    expect(state().entries).toEqual([{ kind: 'new', uploadId: 'u1' }])
  })

  it('lets a failed photo be removed', async () => {
    renderPicker()
    pick('a.jpg')
    await finish(0, { ok: false, error: 'unreadable' })
    await screen.findByRole('button', { name: 'Odstranit fotku 1' })

    fireEvent.click(screen.getByRole('button', { name: 'Odstranit fotku 1' }))

    expect(state()).toMatchObject({ entries: [], busy: false, failed: false })
  })
})
