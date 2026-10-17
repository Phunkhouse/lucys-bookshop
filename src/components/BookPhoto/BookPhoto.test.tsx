import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BookPhoto } from './BookPhoto'

const photo = { baseKey: 'books/b1/i1', width: 1200, height: 1600 }
const BASE = 'https://pub-abc.r2.dev'

const image = (props: Partial<Parameters<typeof BookPhoto>[0]> = {}) => {
  const { container } = render(
    <BookPhoto
      photo={photo}
      baseUrl={BASE}
      alt="Stíny nad Vltavou"
      sizes="(min-width: 800px) 560px, 100vw"
      {...props}
    />,
  )
  return container.querySelector('img')!
}

describe('BookPhoto', () => {
  it('renders the picture with the right sources, size hints, text and real size', () => {
    const img = image()

    expect(img.getAttribute('src')).toBe(`${BASE}/books/b1/i1/medium.jpg`)
    expect(img.getAttribute('srcset')).toBe(
      `${BASE}/books/b1/i1/thumb.jpg 360w, ${BASE}/books/b1/i1/medium.jpg 720w, ${BASE}/books/b1/i1/large.jpg 1200w`,
    )
    expect(img.getAttribute('sizes')).toBe('(min-width: 800px) 560px, 100vw')
    expect(img.getAttribute('alt')).toBe('Stíny nad Vltavou')
    // The real size lets the browser reserve space, so the page does not jump.
    expect(img.getAttribute('width')).toBe('1200')
    expect(img.getAttribute('height')).toBe('1600')
  })

  it('loads lazily and decodes without blocking, by default', () => {
    const img = image()

    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('decoding')).toBe('async')
    expect(img.hasAttribute('fetchpriority')).toBe(false)
  })

  it('loads at once, with high priority, when it is the important one', () => {
    const img = image({ priority: true })

    expect(img.getAttribute('loading')).toBe('eager')
    expect(img.getAttribute('fetchpriority')).toBe('high')
  })

  it('keeps an empty alt as it is (a decorative picture)', () => {
    const img = image({ alt: '' })

    expect(img.hasAttribute('alt')).toBe(true)
    expect(img.getAttribute('alt')).toBe('')
  })
})
