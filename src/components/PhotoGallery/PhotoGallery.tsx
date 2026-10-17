'use client'

import useEmblaCarousel from 'embla-carousel-react'
import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { BookPhoto } from '@/components/BookPhoto'
import type { PhotoRef } from '@/lib/photo-srcset'
import css from './PhotoGallery.module.scss'

type PhotoGalleryProps = {
  photos: PhotoRef[]
  // The book's title: the description of its photos.
  title: string
  imageBaseUrl: string
  // How wide the photos are shown, so the browser can pick a size.
  sizes: string
}

// The photos of one book. Several photos make a carousel that can be dragged or
// swiped, paged with buttons or the arrow keys. The counter and the buttons sit
// in a fixed row below, so nothing moves along with a photo. One photo is just
// the picture. Embla Carousel does the sliding and dragging; the markup, the
// labels and the styling are ours.
export function PhotoGallery({
  photos,
  title,
  imageBaseUrl,
  sizes,
}: PhotoGalleryProps) {
  const t = useTranslations('Book.photos')
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false })
  const total = photos.length
  const many = total > 1

  // The selected photo lives in the carousel; this follows it. Before the
  // carousel has started (on the server, on first load) it is the first photo.
  const selected = useSyncExternalStore(
    (onChange) => {
      if (!many || !emblaApi) return () => {}
      emblaApi.on('select', onChange).on('reInit', onChange)
      return () => {
        emblaApi.off('select', onChange).off('reInit', onChange)
      }
    },
    () => (many && emblaApi ? emblaApi.selectedScrollSnap() : 0),
    () => 0,
  )

  if (!many) {
    return (
      <div className={css.frame}>
        <BookPhoto
          photo={photos[0]}
          baseUrl={imageBaseUrl}
          alt={title}
          sizes={sizes}
          priority
          className={css.photo}
        />
      </div>
    )
  }

  const counter = t('place', { n: selected + 1, total })

  return (
    <section
      className={css.gallery}
      aria-roledescription="carousel"
      aria-label={t('galleryLabel')}
    >
      {/* A tab stop, so the arrow keys work for people without a mouse. */}
      <div
        className={css.viewport}
        ref={emblaRef}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            emblaApi?.scrollNext()
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault()
            emblaApi?.scrollPrev()
          }
        }}
      >
        <div className={css.track}>
          {photos.map((photo, index) => (
            <div
              key={photo.baseKey}
              className={css.slide}
              role="group"
              aria-roledescription="slide"
              aria-label={t('place', { n: index + 1, total })}
            >
              <BookPhoto
                photo={photo}
                baseUrl={imageBaseUrl}
                alt={t('alt', { title, n: index + 1, total })}
                sizes={sizes}
                priority={index === 0}
                className={css.photo}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={css.controls}>
        <button
          type="button"
          className={css.button}
          aria-label={t('previousLabel')}
          disabled={selected === 0}
          onClick={() => emblaApi?.scrollPrev()}
        >
          <span aria-hidden="true">‹</span> {t('previous')}
        </button>
        <p role="status" aria-live="polite" className={css.counter}>
          {counter}
        </p>
        <button
          type="button"
          className={css.button}
          aria-label={t('nextLabel')}
          disabled={selected >= total - 1}
          onClick={() => emblaApi?.scrollNext()}
        >
          {t('next')} <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  )
}
