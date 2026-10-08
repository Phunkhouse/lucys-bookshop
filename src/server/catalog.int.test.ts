import { beforeEach, describe, expect, it } from 'vitest'
import { getBookByShortId, listCatalog } from './catalog'
import {
  addImage,
  createBook,
  createGenre,
  linkGenre,
  resetDatabase,
} from './db/test-helpers'

const now = new Date('2026-10-08T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)

describe('listCatalog', () => {
  it('returns an empty list when there are no books', async () => {
    expect(await listCatalog(now)).toEqual([])
  })

  it('lists available, reserved and recently sold books, and leaves out the rest', async () => {
    const available = await createBook({ status: 'available' })
    const reserved = await createBook({
      status: 'reserved',
      reservedUntil: at(HOUR),
    })
    const expired = await createBook({
      status: 'reserved',
      reservedUntil: at(-HOUR),
    })
    const soldRecently = await createBook({ status: 'sold', soldAt: at(-DAY) })
    await createBook({ status: 'sold', soldAt: at(-20 * DAY) })
    await createBook({ status: 'hidden' })

    const ids = (await listCatalog(now)).map((b) => b.shortId)
    expect(ids.sort()).toEqual(
      [available, reserved, expired, soldRecently].map((b) => b.shortId).sort(),
    )
  })

  it('puts available books first, then the rest, each group newest first', async () => {
    const oldAvailable = await createBook({ createdAt: at(-5 * DAY) })
    const newReserved = await createBook({
      status: 'reserved',
      reservedUntil: at(HOUR),
      createdAt: at(-1 * DAY),
    })
    const newAvailable = await createBook({ createdAt: at(-2 * DAY) })
    const midSold = await createBook({
      status: 'sold',
      soldAt: at(-DAY),
      createdAt: at(-3 * DAY),
    })
    const expiredReserved = await createBook({
      status: 'reserved',
      reservedUntil: at(-HOUR),
      createdAt: at(-4 * DAY),
    })

    const order = (await listCatalog(now)).map((b) => b.shortId)
    expect(order).toEqual([
      newAvailable.shortId, // available, -2d
      expiredReserved.shortId, // counts as available, -4d
      oldAvailable.shortId, // available, -5d
      newReserved.shortId, // not available, -1d
      midSold.shortId, // not available, -3d
    ])
  })

  it('breaks ties on creation time by short id', async () => {
    const createdAt = at(-DAY)
    await createBook({ shortId: 'bbbbbb', createdAt })
    await createBook({ shortId: 'aaaaaa', createdAt })
    await createBook({ shortId: 'cccccc', createdAt })

    const order = (await listCatalog(now)).map((b) => b.shortId)
    expect(order).toEqual(['aaaaaa', 'bbbbbb', 'cccccc'])
  })

  it('shows the display status: an expired reservation is available', async () => {
    await createBook({
      shortId: 'expire',
      status: 'reserved',
      reservedUntil: at(-HOUR),
    })
    await createBook({
      shortId: 'held01',
      status: 'reserved',
      reservedUntil: at(HOUR),
    })
    await createBook({ shortId: 'sold01', status: 'sold', soldAt: at(-DAY) })

    const byId = Object.fromEntries(
      (await listCatalog(now)).map((b) => [b.shortId, b.status]),
    )
    expect(byId).toEqual({
      expire: 'available',
      held01: 'reserved',
      sold01: 'sold',
    })
  })

  it('returns genre keys sorted, and an empty list for a book without genres', async () => {
    const withGenres = await createBook({ shortId: 'genres' })
    await createBook({ shortId: 'nogenr' })
    const crime = await createGenre('crime')
    const novel = await createGenre('novel')
    const poetry = await createGenre('poetry')
    for (const g of [poetry, crime, novel]) await linkGenre(withGenres.id, g.id)

    const byId = Object.fromEntries(
      (await listCatalog(now)).map((b) => [b.shortId, b.genres]),
    )
    expect(byId).toEqual({ genres: ['crime', 'novel', 'poetry'], nogenr: [] })
  })

  it('uses the image with the lowest position as cover, whatever the insert order', async () => {
    const book = await createBook({ shortId: 'photos' })
    await createBook({ shortId: 'nophot' })
    await addImage(book.id, 3)
    await addImage(book.id, 1)
    await addImage(book.id, 2)

    const byId = Object.fromEntries(
      (await listCatalog(now)).map((b) => [b.shortId, b.cover]),
    )
    expect(byId.photos).toEqual({
      baseKey: `books/${book.id}/img1`,
      width: 960,
      height: 1280,
    })
    expect(byId.nophot).toBeNull()
  })

  it('returns a book with several genres and photos exactly once', async () => {
    const book = await createBook()
    for (const key of ['a', 'b', 'c']) {
      await linkGenre(book.id, (await createGenre(key)).id)
    }
    for (let p = 0; p < 5; p++) await addImage(book.id, p)

    expect(await listCatalog(now)).toHaveLength(1)
  })

  it('exposes only the fields the page needs', async () => {
    await createBook({
      shortId: 'fields',
      status: 'reserved',
      reservedUntil: at(HOUR),
    })

    const [item] = await listCatalog(now)
    expect(item).toEqual({
      shortId: 'fields',
      title: expect.any(String),
      author: 'Test Author',
      priceMinor: 10000,
      currency: 'CZK',
      condition: 'used',
      language: 'cs',
      status: 'reserved',
      genres: [],
      cover: null,
    })
  })
})

describe('getBookByShortId', () => {
  it('returns null for an unknown id', async () => {
    expect(await getBookByShortId('nothere', now)).toBeNull()
  })

  it.each(['', 'ABCDEF12', 'abc', 'abcdefghi', 'abc def', "x'; drop"])(
    'returns null for the malformed id %j',
    async (id) => {
      await createBook({ shortId: 'abcdef12' })
      expect(await getBookByShortId(id, now)).toBeNull()
    },
  )

  it('returns null for a hidden book', async () => {
    const book = await createBook({ status: 'hidden' })
    expect(await getBookByShortId(book.shortId, now)).toBeNull()
  })

  it('returns the full detail with images by position and sorted genres', async () => {
    const book = await createBook({
      shortId: 'detail1',
      title: 'Příliš žluťoučký kůň',
      isbn: '9780000000019',
      description: 'Popis knihy.',
      conditionNote: 'Ohnutý roh.',
    })
    await linkGenre(book.id, (await createGenre('poetry')).id)
    await linkGenre(book.id, (await createGenre('novel')).id)
    await addImage(book.id, 2)
    await addImage(book.id, 0)

    expect(await getBookByShortId('detail1', now)).toEqual({
      shortId: 'detail1',
      title: 'Příliš žluťoučký kůň',
      author: 'Test Author',
      isbn: '9780000000019',
      description: 'Popis knihy.',
      conditionNote: 'Ohnutý roh.',
      priceMinor: 10000,
      currency: 'CZK',
      condition: 'used',
      language: 'cs',
      status: 'available',
      soldAt: null,
      genres: ['novel', 'poetry'],
      images: [
        { baseKey: `books/${book.id}/img0`, width: 960, height: 1280 },
        { baseKey: `books/${book.id}/img2`, width: 960, height: 1280 },
      ],
    })
  })

  it('shows an expired reservation as available', async () => {
    const book = await createBook({
      status: 'reserved',
      reservedUntil: at(-HOUR),
    })
    expect((await getBookByShortId(book.shortId, now))?.status).toBe(
      'available',
    )
  })

  it('still returns a book sold 100 days ago, with its sold date', async () => {
    const soldAt = at(-100 * DAY)
    const book = await createBook({ status: 'sold', soldAt })

    const detail = await getBookByShortId(book.shortId, now)
    expect(detail?.status).toBe('sold')
    expect(detail?.soldAt).toEqual(soldAt)
  })
})
