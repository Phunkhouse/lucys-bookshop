import { photoSources, type PhotoRef } from '@/lib/photo-srcset'

type BookPhotoProps = {
  photo: PhotoRef
  // IMAGE_BASE_URL, passed down by the page (it is server-side configuration).
  baseUrl: string
  // Empty for a decorative picture (the caption or link next to it says it all).
  alt: string
  // How wide the picture is shown, so the browser can pick a size.
  sizes: string
  // The most important picture of the page: loaded at once, with high priority.
  priority?: boolean
  className?: string
}

// A plain <img> with the three pre-made sizes in srcset. Next's image component
// is not used: the sizes are made when the photo is added, so there is nothing
// to optimise, and this needs no loader and no client code.
export function BookPhoto({
  photo,
  baseUrl,
  alt,
  sizes,
  priority = false,
  className,
}: BookPhotoProps) {
  const sources = photoSources(baseUrl, photo)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={sources.src}
      srcSet={sources.srcSet}
      sizes={sizes}
      alt={alt}
      width={sources.width}
      height={sources.height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
    />
  )
}
