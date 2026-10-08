import { describe, expect, it } from 'vitest'
import cs from '../../../messages/cs.json'
import { displayStatus, isListedInCatalog } from '../availability'
import { SEED_GENRES, buildSeedBooks } from './seed-data'

const now = new Date('2026-10-08T12:00:00.000Z')
const books = buildSeedBooks(now)

describe('seed data', () => {
  it('has about 30 books', () => {
    expect(books).toHaveLength(30)
  })

  it('has unique short ids that the database accepts', () => {
    const ids = books.map((b) => b.shortId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{6,8}$/)
  })

  it('respects the database checks on prices and dates', () => {
    for (const b of books) {
      expect(Number.isInteger(b.priceMinor)).toBe(true)
      expect(b.priceMinor).toBeGreaterThanOrEqual(0)
      if (b.status === 'reserved') expect(b.reservedUntil).not.toBeNull()
      if (b.status === 'sold') expect(b.soldAt).not.toBeNull()
    }
  })

  it('only uses known genres, and every genre has a Czech label', () => {
    const keys: string[] = SEED_GENRES.map((g) => g.key)
    for (const b of books) {
      for (const g of b.genres) expect(keys).toContain(g)
    }
    for (const key of keys) {
      expect(cs.Genres).toHaveProperty(key)
    }
  })

  it('covers every case the catalog and detail page must handle', () => {
    const shown = books.map((b) => displayStatus(b, now))
    expect(shown).toContain('available')
    expect(shown).toContain('reserved')
    expect(shown).toContain('sold')
    expect(shown).toContain('hidden')
    // An expired reservation that displays as available.
    expect(
      books.some(
        (b) => b.status === 'reserved' && displayStatus(b, now) === 'available',
      ),
    ).toBe(true)
    // Sold both inside and outside the 14-day window.
    const sold = books.filter((b) => b.status === 'sold')
    expect(sold.some((b) => isListedInCatalog(b, now))).toBe(true)
    expect(sold.some((b) => !isListedInCatalog(b, now))).toBe(true)
  })

  it('covers the edge cases for display', () => {
    expect(books.some((b) => b.isbn === null)).toBe(true)
    expect(books.some((b) => b.genres.length > 1)).toBe(true)
    expect(books.some((b) => b.title.length > 60)).toBe(true)
    expect(books.some((b) => b.description === '')).toBe(true)
    expect(books.some((b) => b.conditionNote !== null)).toBe(true)
    expect(new Set(books.map((b) => b.language)).size).toBeGreaterThan(1)
  })
})
