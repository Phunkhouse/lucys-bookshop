import { describe, expect, it } from 'vitest'
import { shareImage } from './book-share-image'

const SITE = 'https://lucys-bookshop.vercel.app'
const photos = [
  { baseKey: 'books/b1/i1', width: 1200, height: 1600 },
  { baseKey: 'books/b1/i2', width: 1200, height: 1600 },
]

describe('shareImage', () => {
  it('uses the medium size of the first photo, with its size and the title as description', () => {
    expect(
      shareImage(
        { title: 'Stíny nad Vltavou', images: photos },
        'https://pub-abc.r2.dev',
        SITE,
      ),
    ).toEqual({
      url: 'https://pub-abc.r2.dev/books/b1/i1/medium.jpg',
      width: 720,
      height: 960,
      alt: 'Stíny nad Vltavou',
    })
  })

  it('gives nothing for a book without photos', () => {
    expect(
      shareImage(
        { title: 'Bez fotky', images: [] },
        'https://pub-abc.r2.dev',
        SITE,
      ),
    ).toBeNull()
  })

  // A chat preview needs a full address. A base that is a path on the app (like
  // /images) is completed with the shop's own address.
  it('turns an address on the app itself into a full one', () => {
    expect(
      shareImage({ title: 'X', images: photos }, '/images', SITE)?.url,
    ).toBe('https://lucys-bookshop.vercel.app/images/books/b1/i1/medium.jpg')
  })

  it('keeps a full address as it is, and copes with a trailing slash on the shop address', () => {
    expect(
      shareImage(
        { title: 'X', images: photos },
        'https://pub-abc.r2.dev/',
        `${SITE}/`,
      )?.url,
    ).toBe('https://pub-abc.r2.dev/books/b1/i1/medium.jpg')
    expect(
      shareImage({ title: 'X', images: photos }, '/images', `${SITE}/`)?.url,
    ).toBe('https://lucys-bookshop.vercel.app/images/books/b1/i1/medium.jpg')
  })
})
