import { describe, expect, it } from 'vitest'
import { bookPath } from './book-path'

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
