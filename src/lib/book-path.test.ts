import { describe, expect, it } from 'vitest'
import { bookPath, redirectTarget } from './book-path'

describe('bookPath', () => {
  it('joins the short id and the slug of the title', () => {
    expect(bookPath({ shortId: 'abc12345', title: 'Válka s Mloky' })).toBe(
      '/books/abc12345/valka-s-mloky',
    )
  })

  it('caps a very long title at the slug limit', () => {
    const path = bookPath({ shortId: 'abc12345', title: 'x'.repeat(200) })
    expect(path).toBe(`/books/abc12345/${'x'.repeat(60)}`)
  })
})

describe('bookPath with an empty slug', () => {
  it('falls back to a fixed slug when the title has no letters or digits', () => {
    expect(bookPath({ shortId: 'abc12345', title: '!!!' })).toBe(
      '/books/abc12345/book',
    )
  })
})

describe('redirectTarget', () => {
  const book = { shortId: 'abc12345', title: 'Válka s Mloky' }

  it('returns null when the slug is current', () => {
    expect(redirectTarget(book, 'valka-s-mloky')).toBeNull()
  })

  it('returns the canonical path when the slug is outdated', () => {
    expect(redirectTarget(book, 'stary-nazev')).toBe(
      '/books/abc12345/valka-s-mloky',
    )
  })

  it('returns the canonical path when the slug is only different in case', () => {
    expect(redirectTarget(book, 'Valka-s-Mloky')).toBe(
      '/books/abc12345/valka-s-mloky',
    )
  })

  it('uses the fallback slug for a title without letters or digits', () => {
    const odd = { shortId: 'abc12345', title: '???' }
    expect(redirectTarget(odd, 'book')).toBeNull()
  })
})
