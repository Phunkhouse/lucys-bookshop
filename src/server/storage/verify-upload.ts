import { readJpegSize } from './jpeg'
import type { ObjectStorage } from './object-storage'
import {
  ASPECT_TOLERANCE,
  MAX_FILE_BYTES,
  MAX_LONG_EDGE,
  RENDITIONS,
  finalKey,
  stagingKey,
  type Rendition,
} from './rules'

export type VerifyReason =
  | 'missing'
  | 'wrong_type'
  | 'empty'
  | 'too_large'
  | 'not_jpeg'
  | 'truncated'
  | 'bad_dimensions'

export type VerifyResult =
  | { ok: true; width: number; height: number } // the size of the large one
  | { ok: false; reason: VerifyReason }

// How much of the start of a file is searched for the image header.
const HEADER_BYTES = 64 * 1024

const fail = (reason: VerifyReason): VerifyResult => ({ ok: false, reason })

// Checks the three sizes of a photo wherever they are stored (spec 6.9: "the
// server checks each uploaded object"). Nothing here comes from the browser:
// type, size, the first and last bytes and the picture size are all read from the
// stored files.
async function verifyRenditions(
  storage: ObjectStorage,
  keyFor: (rendition: Rendition) => string,
): Promise<VerifyResult> {
  const sizes = {} as Record<Rendition, { width: number; height: number }>

  for (const rendition of RENDITIONS) {
    const key = keyFor(rendition)
    const info = await storage.head(key)
    if (!info) return fail('missing')
    if (info.contentType !== 'image/jpeg') return fail('wrong_type')
    if (info.size === 0) return fail('empty')
    if (info.size > MAX_FILE_BYTES) return fail('too_large')

    const head = await storage.readRange(
      key,
      0,
      Math.min(info.size, HEADER_BYTES) - 1,
    )
    if (
      head.length < 3 ||
      head[0] !== 0xff ||
      head[1] !== 0xd8 ||
      head[2] !== 0xff
    ) {
      return fail('not_jpeg')
    }
    // Every complete JPEG ends with the marker FF D9; an interrupted upload does not.
    const tail = await storage.readRange(key, info.size - 2, info.size - 1)
    if (tail.length < 2 || tail[0] !== 0xff || tail[1] !== 0xd9) {
      return fail('truncated')
    }

    const size = readJpegSize(head)
    if (!size) return fail('not_jpeg')
    if (Math.max(size.width, size.height) > MAX_LONG_EDGE[rendition]) {
      return fail('bad_dimensions')
    }
    sizes[rendition] = size
  }

  const longEdge = (r: Rendition) => Math.max(sizes[r].width, sizes[r].height)
  if (
    longEdge('thumb') > longEdge('medium') ||
    longEdge('medium') > longEdge('large')
  ) {
    return fail('bad_dimensions')
  }
  const aspect = (r: Rendition) => sizes[r].width / sizes[r].height
  for (const rendition of ['thumb', 'medium'] as const) {
    if (
      Math.abs(aspect(rendition) - aspect('large')) / aspect('large') >
      ASPECT_TOLERANCE
    ) {
      return fail('bad_dimensions')
    }
  }

  return { ok: true, width: sizes.large.width, height: sizes.large.height }
}

// An upload waiting in the staging area.
export function verifyUpload(
  storage: ObjectStorage,
  uploadId: string,
): Promise<VerifyResult> {
  return verifyRenditions(storage, (rendition) =>
    stagingKey(uploadId, rendition),
  )
}

// A photo in its final place. Staged files can be replaced by whoever holds the
// upload links until the copy happens, so the copies are checked again: they are
// what the shop will serve, and nobody else can write there.
export function verifyFinalPhoto(
  storage: ObjectStorage,
  baseKey: string,
): Promise<VerifyResult> {
  return verifyRenditions(storage, (rendition) => finalKey(baseKey, rendition))
}
