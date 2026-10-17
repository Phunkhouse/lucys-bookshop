import { imageUrl } from './image-url'
import { RENDITIONS, type Rendition } from './photo-rules'
import { computeSizes } from './photo-sizes'

export type PhotoRef = { baseKey: string; width: number; height: number }

// What an <img> needs to show a saved photo: the nearest of the three pre-made
// sizes is picked by the browser from `srcSet`. `width` and `height` are the
// real size of the large one (what the database stores), which lets the browser
// reserve the space before the photo arrives.
//
// The widths are those the sizes were made at (the same calculation the browser
// used when the photo was added). Where two sizes came out equal (a small
// original is never enlarged), the width is listed once, with the larger name.
export function photoSources(base: string, photo: PhotoRef) {
  const computed = computeSizes(photo.width, photo.height)
  const widthOf: Record<Rendition, number> = computed.ok
    ? {
        thumb: computed.sizes.thumb.width,
        medium: computed.sizes.medium.width,
        large: computed.sizes.large.width,
      }
    : { thumb: photo.width, medium: photo.width, large: photo.width }

  const byWidth = new Map<number, Rendition>()
  for (const rendition of [...RENDITIONS].reverse()) {
    if (!byWidth.has(widthOf[rendition]))
      byWidth.set(widthOf[rendition], rendition)
  }
  const srcSet = [...byWidth]
    .sort(([a], [b]) => a - b)
    .map(
      ([width, rendition]) =>
        `${imageUrl(base, photo.baseKey, rendition)} ${width}w`,
    )
    .join(', ')

  const fallback: Rendition =
    widthOf.medium === widthOf.large ? 'large' : 'medium'
  return {
    src: imageUrl(base, photo.baseKey, fallback),
    srcSet,
    width: photo.width,
    height: photo.height,
  }
}
