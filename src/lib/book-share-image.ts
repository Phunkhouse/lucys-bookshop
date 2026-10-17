import { imageUrl } from './image-url'
import { computeSizes } from './photo-sizes'
import type { PhotoRef } from './photo-srcset'

// The picture a chat app shows when the book's link is shared: the medium size
// of the first photo. The address must be complete, so an image address that is
// a path on the app (like /images) is completed with the shop's own address.
export function shareImage(
  book: { title: string; images: PhotoRef[] },
  imageBaseUrl: string,
  siteUrl: string,
) {
  const first = book.images[0]
  if (!first) return null

  const computed = computeSizes(first.width, first.height)
  const size = computed.ok
    ? computed.sizes.medium
    : { width: first.width, height: first.height }
  return {
    url: new URL(
      imageUrl(imageBaseUrl, first.baseKey, 'medium'),
      siteUrl,
    ).toString(),
    width: size.width,
    height: size.height,
    alt: book.title,
  }
}
