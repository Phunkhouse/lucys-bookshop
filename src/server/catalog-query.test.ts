import { describe, expect, it } from 'vitest'
import {
  CATALOG_PAGE_SIZE,
  defaultCatalogQuery,
  parseCatalogQuery,
  serializeCatalogQuery,
} from './catalog-query'

describe('parseCatalogQuery: defaults', () => {
  it('gives the default query for no parameters', () => {
    expect(parseCatalogQuery({})).toEqual(defaultCatalogQuery)
  })

  it('defaults to newest first, page 1, nothing filtered', () => {
    expect(defaultCatalogQuery).toEqual({
      q: undefined,
      genres: [],
      conditions: [],
      languages: [],
      minPriceMinor: undefined,
      maxPriceMinor: undefined,
      onlyAvailable: false,
      sort: 'newest',
      page: 1,
    })
  })

  it('uses 24 books per page', () => {
    expect(CATALOG_PAGE_SIZE).toBe(24)
  })

  it('accepts what Next.js hands over for repeated and missing keys', () => {
    expect(
      parseCatalogQuery({ genre: ['fantasy', 'crime'], q: undefined }).genres,
    ).toEqual(['crime', 'fantasy'])
  })
})

describe('parseCatalogQuery: search text', () => {
  it('trims and collapses whitespace', () => {
    expect(parseCatalogQuery({ q: '  Karel   Čapek ' }).q).toBe('Karel Čapek')
  })

  it.each(['', '   '])('treats %j as no search', (q) => {
    expect(parseCatalogQuery({ q }).q).toBeUndefined()
  })

  it('cuts a very long text at 100 characters', () => {
    expect(parseCatalogQuery({ q: 'a'.repeat(500) }).q).toHaveLength(100)
  })

  it('uses the first value when the key is repeated', () => {
    expect(parseCatalogQuery({ q: ['first', 'second'] }).q).toBe('first')
  })
})

describe('parseCatalogQuery: filters', () => {
  it('reads, sorts and de-duplicates genres', () => {
    expect(
      parseCatalogQuery({ genre: ['scifi', 'crime', 'scifi'] }).genres,
    ).toEqual(['crime', 'scifi'])
  })

  it('reads a single genre given as a plain string', () => {
    expect(parseCatalogQuery({ genre: 'fantasy' }).genres).toEqual(['fantasy'])
  })

  it.each(['Fantasy', 'with space', "x'; drop", '', 'a'.repeat(41)])(
    'drops the genre key %j that has the wrong shape',
    (genre) => {
      expect(parseCatalogQuery({ genre }).genres).toEqual([])
    },
  )

  it('keeps an unknown but well-formed genre (it simply matches nothing)', () => {
    expect(parseCatalogQuery({ genre: 'cooking' }).genres).toEqual(['cooking'])
  })

  it('keeps at most 10 genres', () => {
    const genre = Array.from({ length: 15 }, (_, i) => `genre${i}`)
    expect(parseCatalogQuery({ genre }).genres).toHaveLength(10)
  })

  it('reads known conditions and drops unknown ones', () => {
    expect(
      parseCatalogQuery({ condition: ['used', 'broken', 'like_new'] })
        .conditions,
    ).toEqual(['like_new', 'used'])
  })

  it('reads languages as lowercase two-letter codes', () => {
    expect(
      parseCatalogQuery({ lang: ['en', 'cs', 'CS', 'english', ''] }).languages,
    ).toEqual(['cs', 'en'])
  })

  it('reads the availability toggle only for the value 1', () => {
    expect(parseCatalogQuery({ available: '1' }).onlyAvailable).toBe(true)
    expect(parseCatalogQuery({ available: 'true' }).onlyAvailable).toBe(false)
    expect(parseCatalogQuery({ available: '0' }).onlyAvailable).toBe(false)
  })
})

describe('parseCatalogQuery: price range', () => {
  it('converts whole crowns to minor units', () => {
    const query = parseCatalogQuery({ min: '50', max: '150' })
    expect(query.minPriceMinor).toBe(5_000)
    expect(query.maxPriceMinor).toBe(15_000)
  })

  it('accepts a range with only one end', () => {
    expect(parseCatalogQuery({ min: '50' })).toMatchObject({
      minPriceMinor: 5_000,
      maxPriceMinor: undefined,
    })
    expect(parseCatalogQuery({ max: '150' })).toMatchObject({
      minPriceMinor: undefined,
      maxPriceMinor: 15_000,
    })
  })

  it('accepts zero', () => {
    expect(parseCatalogQuery({ min: '0' }).minPriceMinor).toBe(0)
  })

  it.each(['-5', '1.5', '1,5', 'abc', '', '1e3', '0x10', ' '])(
    'ignores the price %j',
    (value) => {
      const query = parseCatalogQuery({ min: value, max: value })
      expect(query.minPriceMinor).toBeUndefined()
      expect(query.maxPriceMinor).toBeUndefined()
    },
  )

  it('ignores a price above one million crowns', () => {
    expect(parseCatalogQuery({ max: '1000001' }).maxPriceMinor).toBeUndefined()
    expect(parseCatalogQuery({ max: '1000000' }).maxPriceMinor).toBe(
      100_000_000,
    )
  })

  it('swaps the ends when min is greater than max', () => {
    const query = parseCatalogQuery({ min: '200', max: '50' })
    expect(query.minPriceMinor).toBe(5_000)
    expect(query.maxPriceMinor).toBe(20_000)
  })
})

describe('parseCatalogQuery: sort', () => {
  it.each(['newest', 'price-asc', 'price-desc', 'title', 'author'] as const)(
    'accepts the sort %s',
    (sort) => {
      expect(parseCatalogQuery({ sort }).sort).toBe(sort)
    },
  )

  it.each(['', 'price', 'NEWEST', 'random; drop table'])(
    'falls back to newest for %j',
    (sort) => {
      expect(parseCatalogQuery({ sort }).sort).toBe('newest')
    },
  )
})

describe('parseCatalogQuery: page', () => {
  it('reads a positive whole number', () => {
    expect(parseCatalogQuery({ page: '3' }).page).toBe(3)
  })

  it.each(['0', '-1', '2.5', 'abc', '', '1e2', '0x5'])(
    'falls back to page 1 for %j',
    (page) => {
      expect(parseCatalogQuery({ page }).page).toBe(1)
    },
  )

  it('caps the page at 10000 so the offset stays sane', () => {
    expect(parseCatalogQuery({ page: '99999999999' }).page).toBe(1)
    expect(parseCatalogQuery({ page: '10000' }).page).toBe(10_000)
    expect(parseCatalogQuery({ page: '10001' }).page).toBe(1)
  })
})

describe('parseCatalogQuery: one bad value does not spoil the others', () => {
  it('keeps the valid parts of a messy URL', () => {
    expect(
      parseCatalogQuery({
        q: 'čapek',
        genre: ['crime', 'BAD KEY'],
        min: 'nope',
        max: '300',
        sort: 'cheapest',
        page: '2',
      }),
    ).toEqual({
      ...defaultCatalogQuery,
      q: 'čapek',
      genres: ['crime'],
      maxPriceMinor: 30_000,
      sort: 'newest',
      page: 2,
    })
  })
})

describe('serializeCatalogQuery', () => {
  it('gives an empty string for the default query', () => {
    expect(serializeCatalogQuery(defaultCatalogQuery)).toBe('')
  })

  it('leaves out every value that equals its default', () => {
    expect(
      serializeCatalogQuery({
        ...defaultCatalogQuery,
        sort: 'newest',
        page: 1,
      }),
    ).toBe('')
  })

  it('writes prices back as whole crowns', () => {
    const params = new URLSearchParams(
      serializeCatalogQuery({
        ...defaultCatalogQuery,
        minPriceMinor: 5_000,
        maxPriceMinor: 15_000,
      }),
    )
    expect(params.get('min')).toBe('50')
    expect(params.get('max')).toBe('150')
  })

  it('writes each genre as its own repeated key, in sorted order', () => {
    const params = new URLSearchParams(
      serializeCatalogQuery({
        ...defaultCatalogQuery,
        genres: ['crime', 'scifi'],
      }),
    )
    expect(params.getAll('genre')).toEqual(['crime', 'scifi'])
  })

  it('encodes the search text safely', () => {
    const text = 'Čapek & "Válka" s mloky?#'
    const params = new URLSearchParams(
      serializeCatalogQuery({ ...defaultCatalogQuery, q: text }),
    )
    expect(params.get('q')).toBe(text)
  })

  it('does not start with a question mark', () => {
    expect(
      serializeCatalogQuery({ ...defaultCatalogQuery, sort: 'title' }),
    ).not.toMatch(/^\?/)
  })

  it('writes the availability toggle as available=1', () => {
    const params = new URLSearchParams(
      serializeCatalogQuery({ ...defaultCatalogQuery, onlyAvailable: true }),
    )
    expect(params.get('available')).toBe('1')
  })

  it('round-trips a full query through parse', () => {
    const query = {
      q: 'Karel Čapek',
      genres: ['crime', 'novel'],
      conditions: ['like_new' as const],
      languages: ['cs', 'en'],
      minPriceMinor: 5_000,
      maxPriceMinor: 15_000,
      onlyAvailable: true,
      sort: 'price-desc' as const,
      page: 4,
    }
    const params = new URLSearchParams(serializeCatalogQuery(query))
    const fromUrl: Record<string, string | string[]> = {}
    for (const key of new Set(params.keys())) {
      const values = params.getAll(key)
      fromUrl[key] = values.length === 1 ? values[0] : values
    }
    expect(parseCatalogQuery(fromUrl)).toEqual(query)
  })

  it('gives the same string for the same query however it was written', () => {
    const a = parseCatalogQuery({ genre: ['scifi', 'crime'], page: '2' })
    const b = parseCatalogQuery({ page: '2', genre: ['crime', 'scifi'] })
    expect(serializeCatalogQuery(a)).toBe(serializeCatalogQuery(b))
  })
})
