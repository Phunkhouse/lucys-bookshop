import {
  MAX_ASPECT,
  MAX_LONG_EDGE,
  RENDITIONS,
  type Rendition,
} from './photo-rules'

export type PhotoSizes = Record<Rendition, { width: number; height: number }>

export type SizesResult =
  { ok: true; sizes: PhotoSizes } | { ok: false; error: 'tooExtreme' }

// The three sizes to make of a photo: the longest edge at most 480, 960 and
// 1600 px, proportions kept, never enlarged. Anything the server would refuse
// (a shape beyond 4:1, or a size that makes no sense) is refused here first.
export function computeSizes(width: number, height: number): SizesResult {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) {
    return { ok: false, error: 'tooExtreme' }
  }
  if (Math.max(width / height, height / width) > MAX_ASPECT) {
    return { ok: false, error: 'tooExtreme' }
  }

  const longEdge = Math.max(width, height)
  const sizes = {} as PhotoSizes
  for (const rendition of RENDITIONS) {
    const scale = Math.min(1, MAX_LONG_EDGE[rendition] / longEdge)
    sizes[rendition] = {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    }
  }
  return { ok: true, sizes }
}
