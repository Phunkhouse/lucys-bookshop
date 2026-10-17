import { describe, expect, it, vi } from 'vitest'
import { resizeToJpegs, type ResizeDeps } from './photo-resize'
import { MAX_FILE_BYTES } from './photo-rules'

// Decoding and drawing need a real browser, so they are injected here. This
// tests what the code around them decides.

const blobOf = (bytes: number) =>
  new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })

function setup(
  size = { width: 3000, height: 4000 },
  encode: ResizeDeps['encode'] = async () => blobOf(1000),
) {
  const decoded = { ...size, close: vi.fn() }
  const decode = vi.fn(async () => decoded)
  const encodeSpy = vi.fn(encode)
  return {
    decoded,
    decode,
    encode: encodeSpy,
    deps: { decode, encode: encodeSpy },
  }
}

const file = new Blob(['photo'], { type: 'image/jpeg' })

describe('resizeToJpegs', () => {
  it('makes the three sizes, in the computed dimensions, at quality 0.85', async () => {
    const { deps, encode } = setup()

    const result = await resizeToJpegs(file, deps)

    if (!result.ok) throw new Error('expected success')
    expect(Object.keys(result.files).sort()).toEqual([
      'large',
      'medium',
      'thumb',
    ])
    expect(
      encode.mock.calls.map(([, size, quality]) => [size, quality]),
    ).toEqual([
      [{ width: 360, height: 480 }, 0.85],
      [{ width: 720, height: 960 }, 0.85],
      [{ width: 1200, height: 1600 }, 0.85],
    ])
  })

  it('reports the size of the large one', async () => {
    const { deps } = setup()

    expect(await resizeToJpegs(file, deps)).toMatchObject({
      ok: true,
      width: 1200,
      height: 1600,
    })
  })

  it('lowers the quality for a file over 2 MB: 0.85, then 0.75, then 0.65', async () => {
    const { deps, encode } = setup(
      { width: 3000, height: 4000 },
      async (_d, size, quality) =>
        blobOf(
          size.width === 1200 && quality > 0.8 ? MAX_FILE_BYTES + 1 : 1000,
        ),
    )

    const result = await resizeToJpegs(file, deps)

    expect(result.ok).toBe(true)
    const qualityFor = (width: number) =>
      encode.mock.calls
        .filter(([, size]) => size.width === width)
        .map(([, , q]) => q)
    expect(qualityFor(1200)).toEqual([0.85, 0.75])
    expect(qualityFor(720)).toEqual([0.85])
    expect(qualityFor(360)).toEqual([0.85])
  })

  it('gives up with "tooLarge" when even 0.65 is too big', async () => {
    const { deps, encode } = setup(
      { width: 3000, height: 4000 },
      async (_d, size) =>
        blobOf(size.width === 1200 ? MAX_FILE_BYTES + 1 : 1000),
    )

    expect(await resizeToJpegs(file, deps)).toEqual({
      ok: false,
      error: 'tooLarge',
    })
    expect(
      encode.mock.calls
        .filter(([, size]) => size.width === 1200)
        .map(([, , q]) => q),
    ).toEqual([0.85, 0.75, 0.65])
  })

  it('accepts a file of exactly 2 MB', async () => {
    const { deps } = setup(undefined, async () => blobOf(MAX_FILE_BYTES))

    expect((await resizeToJpegs(file, deps)).ok).toBe(true)
  })

  it('says "unreadable" when the file cannot be decoded (HEIC in Chrome, a damaged file)', async () => {
    const deps = {
      decode: vi.fn(async () => {
        throw new Error('cannot decode')
      }),
      encode: vi.fn(),
    }

    expect(await resizeToJpegs(file, deps)).toEqual({
      ok: false,
      error: 'unreadable',
    })
    expect(deps.encode).not.toHaveBeenCalled()
  })

  it('says "unreadable" for an image without a size', async () => {
    const { deps, decoded } = setup({ width: 0, height: 0 })

    expect(await resizeToJpegs(file, deps)).toEqual({
      ok: false,
      error: 'unreadable',
    })
    expect(decoded.close).toHaveBeenCalled()
  })

  it('says "unreadable" when drawing or encoding fails', async () => {
    const { deps } = setup(undefined, async () => {
      throw new Error('toBlob gave null')
    })

    expect(await resizeToJpegs(file, deps)).toEqual({
      ok: false,
      error: 'unreadable',
    })
  })

  it('refuses a too extreme shape without drawing anything', async () => {
    const { deps, encode } = setup({ width: 4001, height: 1000 })

    expect(await resizeToJpegs(file, deps)).toEqual({
      ok: false,
      error: 'tooExtreme',
    })
    expect(encode).not.toHaveBeenCalled()
  })

  it('releases the decoded image afterwards, whatever happened', async () => {
    const ok = setup()
    await resizeToJpegs(file, ok.deps)
    expect(ok.decoded.close).toHaveBeenCalledTimes(1)

    const tooLarge = setup(undefined, async () => blobOf(MAX_FILE_BYTES + 1))
    await resizeToJpegs(file, tooLarge.deps)
    expect(tooLarge.decoded.close).toHaveBeenCalledTimes(1)

    const broken = setup(undefined, async () => {
      throw new Error('boom')
    })
    await resizeToJpegs(file, broken.deps)
    expect(broken.decoded.close).toHaveBeenCalledTimes(1)
  })
})
