import { beforeEach, describe, expect, it } from 'vitest'
import { catalogFilterOptions, listCatalog } from './catalog'
import {
  CATALOG_PAGE_SIZE,
  defaultCatalogQuery,
  type CatalogQuery,
} from './catalog-query'
import {
  addImage,
  createBook,
  createGenre,
  linkGenre,
  resetDatabase,
} from './db/test-helpers'

// Filters, sorts, search and pages of the catalog (ADR 0022). The statuses and
// the default order are covered by catalog.int.test.ts.

const now = new Date('2026-10-08T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)

const query = (overrides: Partial<CatalogQuery>): CatalogQuery => ({
  ...defaultCatalogQuery,
  ...overrides,
})

// Titles of the page, in order.
async function titles(overrides: Partial<CatalogQuery>) {
  return (await listCatalog(query(overrides), now)).items.map((b) => b.title)
}

describe('listCatalog: the page it returns', () => {
  it('gives an empty first page when nothing matches', async () => {
    expect(await listCatalog(defaultCatalogQuery, now)).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageCount: 1,
    })
  })

  it('counts every matching book in total, not only the ones on the page', async () => {
    for (let i = 0; i < 30; i++) await createBook()
    const result = await listCatalog(defaultCatalogQuery, now)
    expect(result.items).toHaveLength(CATALOG_PAGE_SIZE)
    expect(result.total).toBe(30)
    expect(result.pageCount).toBe(2)
  })
})

describe('listCatalog: pages', () => {
  it('fits exactly 24 books on one page and starts a second page at 25', async () => {
    for (let i = 0; i < 24; i++) await createBook()
    expect((await listCatalog(defaultCatalogQuery, now)).pageCount).toBe(1)
    await createBook()
    expect((await listCatalog(defaultCatalogQuery, now)).pageCount).toBe(2)
  })

  it('puts the rest on the last page', async () => {
    for (let i = 0; i < 30; i++) await createBook()
    const result = await listCatalog(query({ page: 2 }), now)
    expect(result.items).toHaveLength(6)
    expect(result.page).toBe(2)
  })

  it('shows every book once across the pages, even when all sort keys tie', async () => {
    // Same price, same creation time: only the short id keeps the order stable.
    for (let i = 0; i < 30; i++) {
      await createBook({ priceMinor: 5000, createdAt: at(-DAY) })
    }
    for (const sort of ['newest', 'price-asc', 'price-desc'] as const) {
      const first = await listCatalog(query({ sort, page: 1 }), now)
      const second = await listCatalog(query({ sort, page: 2 }), now)
      const ids = [...first.items, ...second.items].map((b) => b.shortId)
      expect(new Set(ids).size).toBe(30)
    }
  })

  it('shows the last page when the page is past the end', async () => {
    for (let i = 0; i < 30; i++) await createBook()
    const result = await listCatalog(query({ page: 99 }), now)
    expect(result.page).toBe(2)
    expect(result.items).toHaveLength(6)
  })

  it('shows page 1 as empty, not an error, when the page is past the end of no results', async () => {
    const result = await listCatalog(query({ page: 5 }), now)
    expect(result).toMatchObject({ items: [], total: 0, page: 1, pageCount: 1 })
  })

  it('gives genres and covers to the books of a later page', async () => {
    const genre = await createGenre('fantasy')
    let last
    for (let i = 0; i < 25; i++) {
      last = await createBook({ createdAt: at(-i * HOUR) })
    }
    await linkGenre(last!.id, genre.id)
    await addImage(last!.id, 0)
    const result = await listCatalog(query({ page: 2 }), now)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].genres).toEqual(['fantasy'])
    expect(result.items[0].cover).not.toBeNull()
  })
})

describe('listCatalog: genre filter', () => {
  it('matches books with any of the chosen genres, each book once', async () => {
    const fantasy = await createGenre('fantasy')
    const crime = await createGenre('crime')
    const a = await createBook({ title: 'A fantasy' })
    const b = await createBook({ title: 'B crime' })
    const c = await createBook({ title: 'C both' })
    await createBook({ title: 'D none' })
    await linkGenre(a.id, fantasy.id)
    await linkGenre(b.id, crime.id)
    await linkGenre(c.id, fantasy.id)
    await linkGenre(c.id, crime.id)

    expect((await titles({ genres: ['fantasy'] })).sort()).toEqual([
      'A fantasy',
      'C both',
    ])
    const both = await listCatalog(
      query({ genres: ['fantasy', 'crime'], sort: 'title' }),
      now,
    )
    expect(both.items.map((i) => i.title)).toEqual([
      'A fantasy',
      'B crime',
      'C both',
    ])
    expect(both.total).toBe(3)
  })

  it('still shows all genres of a book that matched on one of them', async () => {
    const fantasy = await createGenre('fantasy')
    const crime = await createGenre('crime')
    const book = await createBook()
    await linkGenre(book.id, fantasy.id)
    await linkGenre(book.id, crime.id)
    const { items } = await listCatalog(query({ genres: ['fantasy'] }), now)
    expect(items[0].genres).toEqual(['crime', 'fantasy'])
  })

  it('gives no books for a genre nobody has', async () => {
    await createBook()
    expect(await titles({ genres: ['cooking'] })).toEqual([])
  })
})

describe('listCatalog: condition, language and availability', () => {
  it('filters by condition', async () => {
    await createBook({ title: 'New', condition: 'like_new' })
    await createBook({ title: 'Used', condition: 'used' })
    expect(await titles({ conditions: ['like_new'] })).toEqual(['New'])
    expect((await titles({ conditions: ['like_new', 'used'] })).sort()).toEqual(
      ['New', 'Used'],
    )
  })

  it('filters by language', async () => {
    await createBook({ title: 'Czech', language: 'cs' })
    await createBook({ title: 'English', language: 'en' })
    await createBook({ title: 'German', language: 'de' })
    expect((await titles({ languages: ['cs', 'en'] })).sort()).toEqual([
      'Czech',
      'English',
    ])
  })

  it('shows only available books, expired reservations included', async () => {
    await createBook({ title: 'Free', status: 'available' })
    await createBook({
      title: 'Lapsed',
      status: 'reserved',
      reservedUntil: at(-HOUR),
    })
    await createBook({
      title: 'Held',
      status: 'reserved',
      reservedUntil: at(HOUR),
    })
    await createBook({ title: 'Gone', status: 'sold', soldAt: at(-DAY) })
    expect((await titles({ onlyAvailable: true })).sort()).toEqual([
      'Free',
      'Lapsed',
    ])
  })

  it('combines different filters with AND', async () => {
    const fantasy = await createGenre('fantasy')
    const hit = await createBook({
      title: 'Hit',
      language: 'cs',
      condition: 'like_new',
      priceMinor: 10000,
    })
    await linkGenre(hit.id, fantasy.id)
    const wrongLanguage = await createBook({
      title: 'Wrong language',
      language: 'en',
      condition: 'like_new',
      priceMinor: 10000,
    })
    await linkGenre(wrongLanguage.id, fantasy.id)
    await createBook({
      title: 'No genre',
      language: 'cs',
      condition: 'like_new',
      priceMinor: 10000,
    })
    expect(
      await titles({
        genres: ['fantasy'],
        languages: ['cs'],
        conditions: ['like_new'],
        minPriceMinor: 5000,
        maxPriceMinor: 15000,
      }),
    ).toEqual(['Hit'])
  })

  it('never shows hidden books or books sold long ago, whatever the filters', async () => {
    await createBook({ status: 'hidden' })
    await createBook({ status: 'sold', soldAt: at(-20 * DAY) })
    await createBook({ title: 'Visible' })
    expect(await titles({ sort: 'price-asc' })).toEqual(['Visible'])
    expect(await titles({ q: 'Test' })).toEqual(['Visible'])
  })
})

describe('listCatalog: price range', () => {
  beforeEach(async () => {
    for (const priceMinor of [4999, 5000, 15000, 15001]) {
      await createBook({ title: `P${priceMinor}`, priceMinor })
    }
  })

  it('includes both ends of the range', async () => {
    expect(
      await titles({
        minPriceMinor: 5000,
        maxPriceMinor: 15000,
        sort: 'price-asc',
      }),
    ).toEqual(['P5000', 'P15000'])
  })

  it('accepts a range with one end', async () => {
    expect(await titles({ minPriceMinor: 15000, sort: 'price-asc' })).toEqual([
      'P15000',
      'P15001',
    ])
    expect(await titles({ maxPriceMinor: 5000, sort: 'price-asc' })).toEqual([
      'P4999',
      'P5000',
    ])
  })
})

describe('listCatalog: search', () => {
  beforeEach(async () => {
    await createBook({
      title: 'Válka s mloky',
      author: 'Karel Čapek',
      isbn: '9788074735615',
    })
    await createBook({
      title: 'Babička',
      author: 'Božena Němcová',
      isbn: '8071850012',
    })
    await createBook({ title: 'Capek without accents', author: 'Someone' })
  })

  it('ignores accents in the book and in the search', async () => {
    expect((await titles({ q: 'capek', sort: 'title' })).sort()).toEqual([
      'Capek without accents',
      'Válka s mloky',
    ])
    expect(await titles({ q: 'němcová' })).toEqual(['Babička'])
    expect(await titles({ q: 'nemcova' })).toEqual(['Babička'])
  })

  it('ignores letter case', async () => {
    expect(await titles({ q: 'BABICKA' })).toEqual(['Babička'])
  })

  it('finds a word inside a longer one', async () => {
    expect(await titles({ q: 'mlok' })).toEqual(['Válka s mloky'])
  })

  it('searches the title and the author', async () => {
    expect(await titles({ q: 'valka' })).toEqual(['Válka s mloky'])
    expect(await titles({ q: 'bozena' })).toEqual(['Babička'])
  })

  it('needs every word to match, in any order and across title and author', async () => {
    expect(await titles({ q: 'capek valka' })).toEqual(['Válka s mloky'])
    expect(await titles({ q: 'mloky karel' })).toEqual(['Válka s mloky'])
    expect(await titles({ q: 'karel babicka' })).toEqual([])
  })

  it('finds a book by its ISBN, with or without hyphens', async () => {
    expect(await titles({ q: '9788074735615' })).toEqual(['Válka s mloky'])
    expect(await titles({ q: '978-80-7473-561-5' })).toEqual(['Válka s mloky'])
    expect(await titles({ q: '8071850012' })).toEqual(['Babička'])
  })

  it('matches a full ISBN exactly: a wrong last digit finds nothing', async () => {
    expect(await titles({ q: '9788074735616' })).toEqual([])
  })

  it('treats % and _ as plain characters', async () => {
    await createBook({ title: '100% pravda' })
    await createBook({ title: 'abc' })
    expect(await titles({ q: '100%' })).toEqual(['100% pravda'])
    expect(await titles({ q: 'a_c' })).toEqual([])
    expect(await titles({ q: '%' })).toEqual(['100% pravda'])
  })

  it('treats quotes and backslashes as plain characters', async () => {
    await createBook({ title: `O'Brien \\ "Ltd"` })
    expect(await titles({ q: `o'brien` })).toEqual([`O'Brien \\ "Ltd"`])
    expect(await titles({ q: `\\` })).toEqual([`O'Brien \\ "Ltd"`])
  })

  it('combines with filters and respects the sort', async () => {
    await createBook({ title: 'Capek cheap', author: 'X', priceMinor: 1000 })
    expect(
      await titles({ q: 'capek', maxPriceMinor: 2000, sort: 'price-asc' }),
    ).toEqual(['Capek cheap'])
    // The last two cost the same: the short id (creation order) decides.
    expect(await titles({ q: 'capek', sort: 'price-asc' })).toEqual([
      'Capek cheap',
      'Válka s mloky',
      'Capek without accents',
    ])
  })

  it('counts only the matches in total', async () => {
    expect((await listCatalog(query({ q: 'capek' }), now)).total).toBe(2)
  })
})

describe('listCatalog: sorts', () => {
  it('newest first by default, newest meaning the latest created', async () => {
    await createBook({ title: 'Old', createdAt: at(-5 * DAY) })
    await createBook({ title: 'New', createdAt: at(-1 * DAY) })
    expect(await titles({ sort: 'newest' })).toEqual(['New', 'Old'])
  })

  it('sorts by price, cheapest or dearest first', async () => {
    await createBook({ title: 'Mid', priceMinor: 5000 })
    await createBook({ title: 'Cheap', priceMinor: 1000 })
    await createBook({ title: 'Dear', priceMinor: 9000 })
    expect(await titles({ sort: 'price-asc' })).toEqual([
      'Cheap',
      'Mid',
      'Dear',
    ])
    expect(await titles({ sort: 'price-desc' })).toEqual([
      'Dear',
      'Mid',
      'Cheap',
    ])
  })

  it('keeps available books first in every sort', async () => {
    await createBook({ title: 'Dear free', priceMinor: 9000 })
    await createBook({
      title: 'Bargain sold',
      priceMinor: 100,
      status: 'sold',
      soldAt: at(-DAY),
    })
    await createBook({
      title: 'Bargain held',
      priceMinor: 200,
      status: 'reserved',
      reservedUntil: at(HOUR),
    })
    await createBook({
      title: 'Bargain lapsed',
      priceMinor: 300,
      status: 'reserved',
      reservedUntil: at(-HOUR),
    })
    expect(await titles({ sort: 'price-asc' })).toEqual([
      'Bargain lapsed',
      'Dear free',
      'Bargain sold',
      'Bargain held',
    ])
    expect((await titles({ sort: 'title' }))[0]).toBe('Bargain lapsed')
    expect((await titles({ sort: 'author' }))[0]).toBe('Bargain lapsed')
  })

  it('sorts by title in Czech order: "Ch" comes after "H"', async () => {
    for (const title of ['Chalupa', 'Dub', 'Hrabal', 'Ivan', 'Cesta']) {
      await createBook({ title })
    }
    expect(await titles({ sort: 'title' })).toEqual([
      'Cesta',
      'Dub',
      'Hrabal',
      'Chalupa',
      'Ivan',
    ])
  })

  it('sorts by title ignoring case, and puts "Č" right after "C"', async () => {
    for (const title of ['bible', 'Čapek', 'Abeceda', 'Cesta', 'Dub']) {
      await createBook({ title })
    }
    expect(await titles({ sort: 'title' })).toEqual([
      'Abeceda',
      'bible',
      'Cesta',
      'Čapek',
      'Dub',
    ])
  })

  it('sorts by author, then by title', async () => {
    await createBook({ title: 'B book', author: 'Zeman' })
    await createBook({ title: 'A book', author: 'Zeman' })
    await createBook({ title: 'Z book', author: 'Čapek' })
    await createBook({ title: 'Y book', author: 'Adler' })
    expect(await titles({ sort: 'author' })).toEqual([
      'Y book',
      'Z book',
      'A book',
      'B book',
    ])
  })

  it('breaks price ties by short id', async () => {
    const first = await createBook({ priceMinor: 5000, shortId: 'aaaaaa01' })
    const second = await createBook({ priceMinor: 5000, shortId: 'aaaaaa02' })
    const { items } = await listCatalog(query({ sort: 'price-asc' }), now)
    expect(items.map((i) => i.shortId)).toEqual([first.shortId, second.shortId])
  })
})

describe('catalogFilterOptions', () => {
  it('lists the genres and languages of listed books, sorted', async () => {
    const fantasy = await createGenre('fantasy')
    const crime = await createGenre('crime')
    const a = await createBook({ language: 'en' })
    const b = await createBook({ language: 'cs' })
    await createBook({ language: 'cs' })
    await linkGenre(a.id, fantasy.id)
    await linkGenre(b.id, crime.id)
    await linkGenre(b.id, fantasy.id)
    expect(await catalogFilterOptions(now)).toEqual({
      genres: ['crime', 'fantasy'],
      languages: ['cs', 'en'],
    })
  })

  it('leaves out genres and languages only found on hidden or long-sold books', async () => {
    const history = await createGenre('history')
    const hidden = await createBook({ status: 'hidden', language: 'de' })
    const oldSold = await createBook({
      status: 'sold',
      soldAt: at(-20 * DAY),
      language: 'fr',
    })
    await linkGenre(hidden.id, history.id)
    await linkGenre(oldSold.id, history.id)
    await createBook({ language: 'cs' })
    expect(await catalogFilterOptions(now)).toEqual({
      genres: [],
      languages: ['cs'],
    })
  })

  it('is empty for an empty shop', async () => {
    expect(await catalogFilterOptions(now)).toEqual({
      genres: [],
      languages: [],
    })
  })
})
