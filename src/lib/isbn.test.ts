import { describe, expect, it } from 'vitest'
import { normalizeIsbn } from './isbn'

describe('normalizeIsbn', () => {
  it.each([
    ['9780306406157', '9780306406157'],
    ['978-0-306-40615-7', '9780306406157'],
    ['978 0 306 40615 7', '9780306406157'],
    ['9788072031238', '9788072031238'],
    ['0306406152', '0306406152'],
    ['0-306-40615-2', '0306406152'],
    ['080442957X', '080442957X'],
    ['080442957x', '080442957X'], // a lowercase x is read as X
  ])('stores %j as %j', (text, expected) => {
    expect(normalizeIsbn(text)).toEqual({ ok: true, value: expected })
  })

  it.each(['', '   '])('treats %j as no ISBN', (text) => {
    expect(normalizeIsbn(text)).toEqual({ ok: true, value: null })
  })

  it.each([
    '9780306406158', // checksum is wrong
    '0306406153', // checksum is wrong
    '12345', // too short
    '97803064061577', // too long
    'abcdefghij',
    '978030640615X', // X is only allowed at the end of an ISBN-10
  ])('rejects %j', (text) => {
    expect(normalizeIsbn(text)).toEqual({ ok: false, error: 'isbnInvalid' })
  })
})
