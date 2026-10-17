import { describe, expect, it } from 'vitest'
import { photoSources } from './photo-srcset'

const BASE = 'https://pub-abc.r2.dev'
const key = 'books/b1/i1'
const url = (name: string, base = BASE) => `${base}/${key}/${name}.jpg`

describe('photoSources', () => {
  it('lists the three sizes with their real widths for a portrait photo, and uses the medium one as the fallback', () => {
    const sources = photoSources(BASE, {
      baseKey: key,
      width: 1200,
      height: 1600,
    })

    expect(sources.srcSet).toBe(
      `${url('thumb')} 360w, ${url('medium')} 720w, ${url('large')} 1200w`,
    )
    expect(sources.src).toBe(url('medium'))
    expect([sources.width, sources.height]).toEqual([1200, 1600])
  })

  it('does the same for a landscape photo', () => {
    const sources = photoSources(BASE, {
      baseKey: key,
      width: 1600,
      height: 1200,
    })

    expect(sources.srcSet).toBe(
      `${url('thumb')} 480w, ${url('medium')} 960w, ${url('large')} 1600w`,
    )
  })

  it('handles a photo that was not large enough to be enlarged to every size', () => {
    const sources = photoSources(BASE, {
      baseKey: key,
      width: 800,
      height: 1000,
    })

    expect(sources.srcSet).toBe(
      `${url('thumb')} 384w, ${url('medium')} 768w, ${url('large')} 800w`,
    )
  })

  it('lists a width only once when two sizes are identical (the larger name wins)', () => {
    const sources = photoSources(BASE, {
      baseKey: key,
      width: 500,
      height: 700,
    })

    expect(sources.srcSet).toBe(`${url('thumb')} 343w, ${url('large')} 500w`)
    expect(sources.src).toBe(url('large'))
  })

  it('uses a single entry when every size is identical', () => {
    const sources = photoSources(BASE, {
      baseKey: key,
      width: 300,
      height: 400,
    })

    expect(sources.srcSet).toBe(`${url('large')} 300w`)
    expect(sources.src).toBe(url('large'))
  })

  it.each([
    ['https://pub-abc.r2.dev/'],
    ['https://images.example.com/shop'],
    ['http://127.0.0.1:9000/bookshop'],
    ['/images'],
  ])('builds the addresses from the base %s', (base) => {
    const sources = photoSources(base, {
      baseKey: key,
      width: 1200,
      height: 1600,
    })
    const root = base.replace(/\/+$/, '')

    expect(sources.src).toBe(`${root}/${key}/medium.jpg`)
    expect(sources.srcSet.split(', ')).toHaveLength(3)
    for (const entry of sources.srcSet.split(', ')) {
      expect(entry.startsWith(`${root}/${key}/`)).toBe(true)
    }
  })
})
