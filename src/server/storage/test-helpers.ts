import { makeJpeg } from './test-jpeg'
import type { FakeObjectStorage } from './fake-object-storage'
import { RENDITIONS, finalKey, type Rendition } from './rules'

type JpegArgs = NonNullable<Parameters<typeof makeJpeg>[2]>

export type RenditionSpec = {
  width?: number
  height?: number
  jpeg?: JpegArgs
  contentType?: string
  bytes?: Uint8Array // use these bytes instead of a generated JPEG
  missing?: boolean // do not upload this rendition at all
}

// A portrait photo 3:4, in the three sizes the browser produces.
const DEFAULT_SIZE: Record<Rendition, [number, number]> = {
  thumb: [360, 480],
  medium: [720, 960],
  large: [1200, 1600],
}

export const stagingKey = (uploadId: string, rendition: Rendition) =>
  `uploads/${uploadId}/${rendition}.jpg`

// Puts the three sizes of a photo at the keys `keyFor` gives. Override any
// detail to break it.
export function putRenditions(
  storage: FakeObjectStorage,
  keyFor: (rendition: Rendition) => string,
  overrides: Partial<Record<Rendition, RenditionSpec>> = {},
) {
  for (const rendition of RENDITIONS) {
    const spec = overrides[rendition] ?? {}
    if (spec.missing) continue
    const [width, height] = DEFAULT_SIZE[rendition]
    storage.put(
      keyFor(rendition),
      spec.bytes ??
        makeJpeg(spec.width ?? width, spec.height ?? height, spec.jpeg),
      spec.contentType ?? 'image/jpeg',
    )
  }
}

// What the browser does after a successful presigned upload: the three sizes
// land in the staging area.
export function stageUpload(
  storage: FakeObjectStorage,
  uploadId: string,
  overrides: Partial<Record<Rendition, RenditionSpec>> = {},
) {
  putRenditions(
    storage,
    (rendition) => stagingKey(uploadId, rendition),
    overrides,
  )
}

// A photo already saved with a book, at its final place.
export function putFinalPhoto(
  storage: FakeObjectStorage,
  baseKey: string,
  overrides: Partial<Record<Rendition, RenditionSpec>> = {},
) {
  putRenditions(storage, (rendition) => finalKey(baseKey, rendition), overrides)
}
