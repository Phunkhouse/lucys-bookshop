import { describe, expect, it, vi } from 'vitest'
import type { ResizeResult } from './photo-resize'
import { uploadPhoto } from './photo-upload'

const blob = (name: string) => new Blob([name], { type: 'image/jpeg' })
const files = {
  thumb: blob('thumb'),
  medium: blob('medium'),
  large: blob('large'),
}
const ticket = {
  uploadId: '0b9d4b6e-6d57-4c2e-9d0a-3f3f5b0c7a11',
  expiresAt: new Date('2026-10-17T12:10:00.000Z').toISOString(),
  urls: {
    thumb: 'https://storage.test/thumb',
    medium: 'https://storage.test/medium',
    large: 'https://storage.test/large',
  },
}

function setup(overrides: Partial<Parameters<typeof uploadPhoto>[1]> = {}) {
  const calls: string[] = []
  const deps = {
    resize: vi.fn(async () => {
      calls.push('resize')
      return { ok: true as const, files, width: 1200, height: 1600 }
    }),
    createTicket: vi.fn(async () => {
      calls.push('ticket')
      return ticket
    }),
    put: vi.fn(async (url: string) => {
      calls.push(`put ${url.split('/').pop()}`)
      return { status: 200 }
    }),
    ...overrides,
  }
  return { deps, calls }
}

const file = new File(['photo'], 'book.jpg', { type: 'image/jpeg' })

describe('uploadPhoto', () => {
  it('resizes first, asks for a ticket only then, and uploads the three sizes', async () => {
    const { deps, calls } = setup()

    const result = await uploadPhoto(file, deps)

    expect(calls[0]).toBe('resize')
    expect(calls[1]).toBe('ticket')
    expect(calls.slice(2).sort()).toEqual([
      'put large',
      'put medium',
      'put thumb',
    ])
    expect(result).toEqual({
      ok: true,
      uploadId: ticket.uploadId,
      previewBlob: files.thumb,
    })
  })

  it('sends each size to its own address as image/jpeg', async () => {
    const { deps } = setup()

    await uploadPhoto(file, deps)

    const sent = vi
      .mocked(deps.put)
      .mock.calls.map(([url, body, type]) => [url, body, type])
    expect(sent).toEqual(
      expect.arrayContaining([
        [ticket.urls.thumb, files.thumb, 'image/jpeg'],
        [ticket.urls.medium, files.medium, 'image/jpeg'],
        [ticket.urls.large, files.large, 'image/jpeg'],
      ]),
    )
  })

  it('does not cost a ticket when the photo cannot be resized', async () => {
    const { deps } = setup({
      resize: vi.fn(async () => ({
        ok: false as const,
        error: 'unreadable' as const,
      })),
    })

    expect(await uploadPhoto(file, deps)).toEqual({
      ok: false,
      error: 'unreadable',
    })
    expect(deps.createTicket).not.toHaveBeenCalled()
    expect(deps.put).not.toHaveBeenCalled()
  })

  it.each([['tooLarge'], ['tooExtreme']] as const)(
    'passes the resize problem "%s" on',
    async (error) => {
      const { deps } = setup({
        resize: vi.fn(async () => ({ ok: false as const, error })),
      })

      expect(await uploadPhoto(file, deps)).toEqual({ ok: false, error })
    },
  )

  it('says "uploadFailed" when one of the three uploads is refused', async () => {
    const { deps } = setup({
      put: vi.fn(async (url: string) => ({
        status: url.endsWith('medium') ? 403 : 200,
      })),
    })

    expect(await uploadPhoto(file, deps)).toEqual({
      ok: false,
      error: 'uploadFailed',
    })
  })

  it('says "uploadFailed" when the network drops or the ticket cannot be had', async () => {
    const network = setup({
      put: vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    })
    expect(await uploadPhoto(file, network.deps)).toEqual({
      ok: false,
      error: 'uploadFailed',
    })

    const noTicket = setup({
      createTicket: vi.fn(async () => {
        throw new Error('server error')
      }),
    })
    expect(await uploadPhoto(file, noTicket.deps)).toEqual({
      ok: false,
      error: 'uploadFailed',
    })
  })

  it('stops when aborted during the resize: no ticket, no uploads', async () => {
    const controller = new AbortController()
    let finishResize: () => void = () => {}
    const { deps } = setup({
      resize: vi.fn(
        (): Promise<ResizeResult> =>
          new Promise((resolve) => {
            finishResize = () =>
              resolve({ ok: true as const, files, width: 1200, height: 1600 })
          }),
      ),
    })

    const pending = uploadPhoto(file, deps, controller.signal)
    controller.abort()
    finishResize()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(deps.createTicket).not.toHaveBeenCalled()
    expect(deps.put).not.toHaveBeenCalled()
  })

  it('stops when aborted while the ticket is being fetched: no uploads', async () => {
    const controller = new AbortController()
    const { deps } = setup({
      createTicket: vi.fn(async () => {
        controller.abort()
        return ticket
      }),
    })

    await expect(
      uploadPhoto(file, deps, controller.signal),
    ).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(deps.put).not.toHaveBeenCalled()
  })
})
