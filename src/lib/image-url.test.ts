import { describe, expect, it } from 'vitest'
import { imageUrl } from './image-url'

describe('imageUrl', () => {
  it('joins a public address, the key and the size', () => {
    expect(imageUrl('https://pub-abc.r2.dev', 'books/b1/i1', 'thumb')).toBe(
      'https://pub-abc.r2.dev/books/b1/i1/thumb.jpg',
    )
  })

  it.each([
    [
      'https://images.example.com/shop',
      'https://images.example.com/shop/books/b1/i1/large.jpg',
    ],
    [
      'http://127.0.0.1:9000/bookshop',
      'http://127.0.0.1:9000/bookshop/books/b1/i1/large.jpg',
    ],
    ['/images', '/images/books/b1/i1/large.jpg'],
  ])('works with the base %s', (base, expected) => {
    expect(imageUrl(base, 'books/b1/i1', 'large')).toBe(expected)
  })

  it('does not double a slash at either end', () => {
    expect(imageUrl('https://pub-abc.r2.dev/', '/books/b1/i1/', 'medium')).toBe(
      'https://pub-abc.r2.dev/books/b1/i1/medium.jpg',
    )
  })
})
