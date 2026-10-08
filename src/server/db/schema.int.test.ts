import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './client'
import { bookGenres, bookImages, books, genres } from './schema'
import { resetDatabase } from './test-helpers'

const validBook = {
  shortId: 'abc12345',
  title: 'Test',
  author: 'Author',
  language: 'cs',
  condition: 'used' as const,
  priceMinor: 10000,
}

// Returns the name of the database constraint a write violated, if any.
async function violatedConstraint(write: Promise<unknown>) {
  try {
    await write
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause
    return cause?.constraint ?? 'unknown error'
  }
  return undefined
}

beforeEach(resetDatabase)

describe('books table', () => {
  it('accepts a valid book and fills in the defaults', async () => {
    const [saved] = await db.insert(books).values(validBook).returning()
    expect(saved.status).toBe('available')
    expect(saved.currency).toBe('CZK')
    expect(saved.description).toBe('')
    expect(saved.createdAt).toBeInstanceOf(Date)
  })

  it.each([
    [
      'a short id with capitals',
      { shortId: 'ABC12345' },
      'books_short_id_format',
    ],
    [
      'a short id that is too short',
      { shortId: 'abc12' },
      'books_short_id_format',
    ],
    ['a negative price', { priceMinor: -1 }, 'books_price_not_negative'],
    ['a lowercase currency', { currency: 'czk' }, 'books_currency_format'],
    [
      'reserved without a deadline',
      { status: 'reserved' as const },
      'books_reserved_has_deadline',
    ],
    ['sold without a date', { status: 'sold' as const }, 'books_sold_has_date'],
  ])('rejects %s', async (_name, change, constraint) => {
    const write = db.insert(books).values({ ...validBook, ...change })
    expect(await violatedConstraint(write)).toBe(constraint)
  })

  it('rejects a second book with the same short id', async () => {
    await db.insert(books).values(validBook)
    const write = db.insert(books).values({ ...validBook, title: 'Other' })
    expect(await violatedConstraint(write)).toBe('books_short_id_key')
  })

  it('allows two books with the same ISBN (several copies)', async () => {
    await db.insert(books).values({ ...validBook, isbn: '9780000000019' })
    await db
      .insert(books)
      .values({ ...validBook, shortId: 'abc12346', isbn: '9780000000019' })
    expect(await db.select().from(books)).toHaveLength(2)
  })

  it('bumps updatedAt when updated through Drizzle', async () => {
    const [saved] = await db.insert(books).values(validBook).returning()
    const [updated] = await db
      .update(books)
      .set({ title: 'Changed' })
      .where(eq(books.id, saved.id))
      .returning()
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      saved.updatedAt.getTime(),
    )
  })
})

describe('related tables', () => {
  it('deletes genre links and images together with the book', async () => {
    const [book] = await db.insert(books).values(validBook).returning()
    const [genre] = await db
      .insert(genres)
      .values({ key: 'novel', slug: 'roman' })
      .returning()
    await db.insert(bookGenres).values({ bookId: book.id, genreId: genre.id })
    await db.insert(bookImages).values({
      bookId: book.id,
      baseKey: 'books/x/y',
      position: 0,
      width: 100,
      height: 100,
    })

    await db.delete(books).where(eq(books.id, book.id))

    expect(await db.select().from(bookGenres)).toHaveLength(0)
    expect(await db.select().from(bookImages)).toHaveLength(0)
    expect(await db.select().from(genres)).toHaveLength(1)
  })

  it('allows at most 5 photos per book, at positions 0 to 4', async () => {
    const [book] = await db.insert(books).values(validBook).returning()
    const image = (position: number) => ({
      bookId: book.id,
      baseKey: `books/x/${position}`,
      position,
      width: 100,
      height: 100,
    })

    expect(
      await violatedConstraint(db.insert(bookImages).values(image(5))),
    ).toBe('book_images_position_range')
    await db.insert(bookImages).values(image(0))
    expect(
      await violatedConstraint(db.insert(bookImages).values(image(0))),
    ).toBe('book_images_book_id_position_unique')
  })
})
