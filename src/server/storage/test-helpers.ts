import { makeJpeg } from './test-jpeg'
import type { FakeObjectStorage } from './fake-object-storage'
import { RENDITIONS, type Rendition } from './rules'

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

// Puts the three renditions of one upload into staging, as the browser would
// after a successful presigned upload. Override any detail to break it.
export function stageUpload(
  storage: FakeObjectStorage,
  uploadId: string,
  overrides: Partial<Record<Rendition, RenditionSpec>> = {},
) {
  for (const rendition of RENDITIONS) {
    const spec = overrides[rendition] ?? {}
    if (spec.missing) continue
    const [width, height] = DEFAULT_SIZE[rendition]
    storage.put(
      stagingKey(uploadId, rendition),
      spec.bytes ??
        makeJpeg(spec.width ?? width, spec.height ?? height, spec.jpeg),
      spec.contentType ?? 'image/jpeg',
    )
  }
}
