import { describe, expect, it } from 'vitest'
import { parseBookForm, SUPPORTED_LANGUAGES } from './book-form-schema'

const valid = {
  title: 'Stíny nad Vltavou',
  author: 'Marta Hrubešová',
  genres: ['crime', 'novel'],
  language: 'cs',
  condition: 'used',
  conditionNote: '',
  description: '',
  price: '189,50',
  isbn: '',
}

const parse = (overrides: Record<string, unknown> = {}) =>
  parseBookForm({ ...valid, ...overrides })

function errorsOf(overrides: Record<string, unknown>) {
  const result = parse(overrides)
  if (result.ok) throw new Error('expected the input to be rejected')
  return result.errors
}

describe('parseBookForm', () => {
  it('turns the form values into book data', () => {
    expect(parse()).toEqual({
      ok: true,
      data: {
        title: 'Stíny nad Vltavou',
        author: 'Marta Hrubešová',
        genres: ['crime', 'novel'],
        language: 'cs',
        condition: 'used',
        conditionNote: null,
        description: '',
        priceMinor: 18950,
        isbn: null,
      },
    })
  })

  it('trims text, and turns a blank note or ISBN into nothing', () => {
    const result = parse({
      title: '  Stíny  ',
      conditionNote: '   ',
      isbn: ' 978-0-306-40615-7 ',
    })

    expect(result).toMatchObject({
      ok: true,
      data: { title: 'Stíny', conditionNote: null, isbn: '9780306406157' },
    })
  })

  it('accepts a missing note, description and genres', () => {
    const result = parseBookForm({
      title: 'A',
      author: 'B',
      language: 'cs',
      condition: 'like_new',
      price: '10',
    })

    expect(result).toMatchObject({
      ok: true,
      data: { conditionNote: null, description: '', genres: [], isbn: null },
    })
  })

  it('requires title and author, also when they are only spaces', () => {
    expect(errorsOf({ title: '' }).title).toBe('required')
    expect(errorsOf({ author: '   ' }).author).toBe('required')
  })

  it('limits the length of text fields', () => {
    expect(parse({ title: 'a'.repeat(200) }).ok).toBe(true)
    expect(errorsOf({ title: 'a'.repeat(201) }).title).toBe('tooLong')
    expect(errorsOf({ author: 'a'.repeat(201) }).author).toBe('tooLong')
    expect(errorsOf({ conditionNote: 'a'.repeat(301) }).conditionNote).toBe(
      'tooLong',
    )
    expect(errorsOf({ description: 'a'.repeat(5001) }).description).toBe(
      'tooLong',
    )
  })

  it('reports price and ISBN problems as keys', () => {
    expect(errorsOf({ price: '' }).price).toBe('required')
    expect(errorsOf({ price: 'abc' }).price).toBe('priceInvalid')
    expect(errorsOf({ price: '0' }).price).toBe('pricePositive')
    expect(errorsOf({ isbn: '9780306406158' }).isbn).toBe('isbnInvalid')
  })

  it('knows the supported languages and rejects others', () => {
    expect(SUPPORTED_LANGUAGES).toEqual([
      'cs',
      'sk',
      'en',
      'de',
      'pl',
      'fr',
      'es',
      'it',
      'ru',
    ])
    expect(errorsOf({ language: 'xx' }).language).toBe('invalidLanguage')
    expect(errorsOf({ language: '' }).language).toBe('invalidLanguage')
  })

  it('accepts only the two conditions', () => {
    expect(parse({ condition: 'like_new' }).ok).toBe(true)
    expect(errorsOf({ condition: 'mint' }).condition).toBe('invalidCondition')
  })

  it('removes duplicate genres and rejects values that are not text', () => {
    expect(parse({ genres: ['crime', 'crime', 'novel'] })).toMatchObject({
      ok: true,
      data: { genres: ['crime', 'novel'] },
    })
    expect(errorsOf({ genres: [123] }).genres).toBe('invalid')
    expect(errorsOf({ genres: 'crime' }).genres).toBe('invalid')
  })

  it('drops fields the form does not own, so a hand-made request cannot set them', () => {
    const result = parse({
      status: 'sold',
      shortId: 'hacked01',
      soldAt: '2020-01-01',
      reservedUntil: '2099-01-01',
      id: 'x',
    })

    if (!result.ok) throw new Error('expected valid input')
    expect(Object.keys(result.data).sort()).toEqual([
      'author',
      'condition',
      'conditionNote',
      'description',
      'genres',
      'isbn',
      'language',
      'priceMinor',
      'title',
    ])
  })

  describe('photos', () => {
    const existing = '5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50'
    const uploaded = '0b9d4b6e-6d57-4c2e-9d0a-3f3f5b0c7a11'

    it('leaves photos out of the result when the form does not send them', () => {
      const result = parse()

      if (!result.ok) throw new Error('expected valid input')
      expect('photos' in result.data).toBe(false)
    })

    it('keeps the order of existing and newly uploaded photos', () => {
      const photos = [
        { kind: 'new', uploadId: uploaded },
        { kind: 'existing', imageId: existing },
      ]

      expect(parse({ photos })).toMatchObject({ ok: true, data: { photos } })
    })

    it('accepts an empty list, which means "no photos"', () => {
      expect(parse({ photos: [] })).toMatchObject({
        ok: true,
        data: { photos: [] },
      })
    })

    it('accepts five photos and rejects six', () => {
      const entries = (count: number) =>
        Array.from({ length: count }, (_, i) => ({
          kind: 'new',
          uploadId: `0b9d4b6e-6d57-4c2e-9d0a-3f3f5b0c7a0${i}`,
        }))

      expect(parse({ photos: entries(5) }).ok).toBe(true)
      expect(errorsOf({ photos: entries(6) }).photos).toBe('tooManyPhotos')
    })

    it.each([
      [{ kind: 'new' }],
      [{ kind: 'new', uploadId: 'not-a-uuid' }],
      [{ kind: 'existing', imageId: '' }],
      [{ kind: 'other', imageId: '5b7f6c0e-3f1a-4a52-9d6b-0b1c2d3e4f50' }],
      ['text'],
      [null],
    ])('rejects the malformed entry %j', (entry) => {
      expect(errorsOf({ photos: [entry] }).photos).toBe('invalid')
    })

    it('rejects photos that are not a list', () => {
      expect(errorsOf({ photos: 'x' }).photos).toBe('invalid')
    })

    it('drops extra fields inside an entry', () => {
      const result = parse({
        photos: [{ kind: 'new', uploadId: uploaded, key: 'books/other/x' }],
      })

      expect(result).toMatchObject({
        ok: true,
        data: { photos: [{ kind: 'new', uploadId: uploaded }] },
      })
      if (result.ok) expect(result.data.photos?.[0]).not.toHaveProperty('key')
    })
  })

  it.each([null, undefined, 'text', 42, []])(
    'rejects %j as a whole',
    (input) => {
      expect(parseBookForm(input)).toEqual({
        ok: false,
        errors: { form: 'invalid' },
      })
    },
  )

  it('reports every problem at once, each as a plain key', () => {
    const errors = errorsOf({ title: '', author: '', price: 'abc' })

    expect(Object.keys(errors).sort()).toEqual(['author', 'price', 'title'])
    for (const key of Object.values(errors)) {
      expect(key).toMatch(/^[a-z][a-zA-Z]*$/)
    }
  })
})
