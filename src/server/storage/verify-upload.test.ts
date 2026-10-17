import { beforeEach, describe, expect, it } from 'vitest'
import { FakeObjectStorage } from './fake-object-storage'
import { MAX_FILE_BYTES } from './rules'
import { putFinalPhoto, stageUpload } from './test-helpers'
import { makePng } from './test-jpeg'
import { verifyFinalPhoto, verifyUpload } from './verify-upload'

const ID = '0b9d4b6e-6d57-4c2e-9d0a-3f3f5b0c7a11'
let storage: FakeObjectStorage

beforeEach(() => {
  storage = new FakeObjectStorage()
})

const reason = async () => {
  const result = await verifyUpload(storage, ID)
  if (result.ok) throw new Error('expected the upload to be rejected')
  return result.reason
}

describe('verifyUpload: what is accepted', () => {
  it('accepts three JPEGs of the right sizes, and reports the size of the large one', async () => {
    stageUpload(storage, ID)

    expect(await verifyUpload(storage, ID)).toEqual({
      ok: true,
      width: 1200,
      height: 1600,
    })
  })

  it('accepts files of exactly 2 MB and pictures of exactly the largest allowed sizes', async () => {
    stageUpload(storage, ID, {
      thumb: { width: 360, height: 480, jpeg: { totalBytes: MAX_FILE_BYTES } },
      medium: { width: 720, height: 960 },
      large: { width: 1200, height: 1600 },
    })

    expect((await verifyUpload(storage, ID)).ok).toBe(true)
  })

  it('accepts a photo that was smaller than the largest size to begin with', async () => {
    stageUpload(storage, ID, {
      thumb: { width: 300, height: 400 },
      medium: { width: 300, height: 400 },
      large: { width: 300, height: 400 },
    })

    expect(await verifyUpload(storage, ID)).toMatchObject({
      ok: true,
      width: 300,
    })
  })

  it('accepts a landscape photo, and small rounding differences in the proportions', async () => {
    stageUpload(storage, ID, {
      thumb: { width: 480, height: 359 },
      medium: { width: 960, height: 720 },
      large: { width: 1600, height: 1200 },
    })

    expect((await verifyUpload(storage, ID)).ok).toBe(true)
  })
})

describe('verifyUpload: what is rejected', () => {
  it.each(['thumb', 'medium', 'large'] as const)(
    'rejects an upload where the %s size is missing',
    async (rendition) => {
      stageUpload(storage, ID, { [rendition]: { missing: true } })

      expect(await reason()).toBe('missing')
    },
  )

  it('rejects an upload that was never made', async () => {
    expect(await reason()).toBe('missing')
  })

  it('rejects a file the storage reports as another type than JPEG', async () => {
    stageUpload(storage, ID, { medium: { contentType: 'image/png' } })

    expect(await reason()).toBe('wrong_type')
  })

  it('rejects a file over 2 MB', async () => {
    stageUpload(storage, ID, {
      large: { jpeg: { totalBytes: MAX_FILE_BYTES + 1 } },
    })

    expect(await reason()).toBe('too_large')
  })

  it('rejects an empty file', async () => {
    stageUpload(storage, ID, { thumb: { bytes: new Uint8Array() } })

    expect(await reason()).toBe('empty')
  })

  it('rejects a PNG that claims to be a JPEG', async () => {
    stageUpload(storage, ID, { large: { bytes: makePng() } })

    expect(await reason()).toBe('not_jpeg')
  })

  it('rejects text that claims to be a JPEG', async () => {
    stageUpload(storage, ID, {
      thumb: { bytes: new TextEncoder().encode('<script>alert(1)</script>') },
    })

    expect(await reason()).toBe('not_jpeg')
  })

  it('rejects a file cut short (an interrupted upload has no end marker)', async () => {
    stageUpload(storage, ID, { large: { jpeg: { truncated: true } } })

    expect(await reason()).toBe('truncated')
  })

  it('rejects a JPEG whose header cannot be found near the start', async () => {
    stageUpload(storage, ID, { medium: { jpeg: { exifBytes: 65_533 } } })

    expect(await reason()).toBe('not_jpeg')
  })

  it.each([
    ['thumb 481 px', { thumb: { width: 361, height: 481 } }],
    ['medium 961 px', { medium: { width: 721, height: 961 } }],
    ['large 1601 px', { large: { width: 1201, height: 1601 } }],
    ['large 2000 px', { large: { width: 1500, height: 2000 } }],
  ] as const)(
    'rejects a picture longer than allowed (%s)',
    async (_name, spec) => {
      stageUpload(storage, ID, spec)

      expect(await reason()).toBe('bad_dimensions')
    },
  )

  it('rejects sizes that are not in order (thumb bigger than large)', async () => {
    stageUpload(storage, ID, {
      thumb: { width: 360, height: 480 },
      medium: { width: 300, height: 400 },
      large: { width: 240, height: 320 },
    })

    expect(await reason()).toBe('bad_dimensions')
  })

  it('rejects sizes whose proportions differ (not the same picture)', async () => {
    stageUpload(storage, ID, { thumb: { width: 480, height: 360 } }) // landscape beside portrait

    expect(await reason()).toBe('bad_dimensions')
  })

  it('rejects a size of zero', async () => {
    stageUpload(storage, ID, { large: { width: 0, height: 1600 } })

    expect(await reason()).toBe('not_jpeg')
  })
})

// The server verifies the files it copied into place (the ones that will be
// served), not only the staged ones, because staged files can be replaced
// until the copy happens. Same rules, other location.
describe('verifyFinalPhoto', () => {
  const BASE = 'books/b1/i1'
  const finalReason = async () => {
    const result = await verifyFinalPhoto(storage, BASE)
    if (result.ok) throw new Error('expected the photo to be rejected')
    return result.reason
  }

  it('accepts a photo whose three sizes are valid, and reports the size of the large one', async () => {
    putFinalPhoto(storage, BASE)

    expect(await verifyFinalPhoto(storage, BASE)).toEqual({
      ok: true,
      width: 1200,
      height: 1600,
    })
  })

  it('reports the size of the file that is really there', async () => {
    putFinalPhoto(storage, BASE, { large: { width: 960, height: 1280 } })

    expect(await verifyFinalPhoto(storage, BASE)).toMatchObject({
      ok: true,
      width: 960,
      height: 1280,
    })
  })

  it.each([
    ['a missing size', { medium: { missing: true } }, 'missing'],
    ['another type', { medium: { contentType: 'image/png' } }, 'wrong_type'],
    ['an empty file', { thumb: { bytes: new Uint8Array() } }, 'empty'],
    [
      'a file over 2 MB',
      { large: { jpeg: { totalBytes: MAX_FILE_BYTES + 1 } } },
      'too_large',
    ],
    ['a PNG', { large: { bytes: makePng() } }, 'not_jpeg'],
    ['a cut-off file', { large: { jpeg: { truncated: true } } }, 'truncated'],
    [
      'a picture that is too long',
      { large: { width: 1201, height: 1601 } },
      'bad_dimensions',
    ],
    [
      'sizes with other proportions',
      { thumb: { width: 480, height: 360 } },
      'bad_dimensions',
    ],
  ] as const)('rejects %s', async (_name, overrides, expected) => {
    putFinalPhoto(storage, BASE, overrides)

    expect(await finalReason()).toBe(expected)
  })
})

// The shop writes each photo's srcset from the sizes the browser's calculation
// gives (computeSizes). So the server must not accept sizes that differ from
// them: a 15 px "thumb" beside a 1200 px large would be sold as 360 px wide.
// A pixel of leeway covers rounding.
describe('verifyUpload: the sizes must be the ones the browser calculates', () => {
  it('rejects a tiny thumb and medium next to a large photo, even with the right proportions', async () => {
    stageUpload(storage, ID, {
      thumb: { width: 15, height: 20 },
      medium: { width: 30, height: 40 },
    })

    expect(await reason()).toBe('bad_dimensions')
  })

  it('rejects a medium that is much smaller than it should be', async () => {
    stageUpload(storage, ID, { medium: { width: 400, height: 533 } })

    expect(await reason()).toBe('bad_dimensions')
  })

  it('does the same for a landscape photo', async () => {
    stageUpload(storage, ID, {
      thumb: { width: 480, height: 360 },
      medium: { width: 700, height: 525 },
      large: { width: 1600, height: 1200 },
    })

    expect(await reason()).toBe('bad_dimensions')
  })

  it('wants every size of a small photo to be as large as the photo, since nothing is shrunk below the limit', async () => {
    stageUpload(storage, ID, {
      thumb: { width: 150, height: 200 },
      medium: { width: 300, height: 400 },
      large: { width: 300, height: 400 },
    })

    expect(await reason()).toBe('bad_dimensions')
  })

  it.each([
    ['1 px wider', { width: 361, height: 480 }],
    ['1 px narrower', { width: 359, height: 480 }],
    ['1 px lower and narrower', { width: 359, height: 479 }],
    ['1 px wider and lower', { width: 361, height: 479 }],
  ])(
    'accepts a thumb that is %s than calculated (rounding)',
    async (_name, size) => {
      stageUpload(storage, ID, { thumb: size })

      expect((await verifyUpload(storage, ID)).ok).toBe(true)
    },
  )

  it.each([
    ['2 px wider', { width: 362, height: 480 }],
    ['2 px narrower', { width: 358, height: 477 }],
    ['3 px lower', { width: 360, height: 477 }],
  ])('rejects a thumb that is %s than calculated', async (_name, size) => {
    stageUpload(storage, ID, { thumb: size })

    expect(await reason()).toBe('bad_dimensions')
  })

  it('applies the same leeway to the medium size', async () => {
    stageUpload(storage, ID, { medium: { width: 721, height: 959 } })
    expect((await verifyUpload(storage, ID)).ok).toBe(true)

    stageUpload(storage, ID, { medium: { width: 718, height: 957 } })
    expect(await reason()).toBe('bad_dimensions')
  })

  it('applies to the files already in place too', async () => {
    putFinalPhoto(storage, 'books/b1/i1', {
      thumb: { width: 15, height: 20 },
      medium: { width: 30, height: 40 },
    })

    const result = await verifyFinalPhoto(storage, 'books/b1/i1')

    expect(result).toEqual({ ok: false, reason: 'bad_dimensions' })
  })
})
