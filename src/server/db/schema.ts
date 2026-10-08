import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const bookStatus = pgEnum('book_status', [
  'available',
  'reserved',
  'sold',
  'hidden',
])

export const bookCondition = pgEnum('book_condition', ['like_new', 'used'])

// One row per physical copy (spec 2 and 7).
export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Random, immutable, used in the URL. The slug is computed from the title and not stored.
    shortId: text('short_id').notNull().unique(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    // Indexed but not unique: the same title can be listed as several copies.
    isbn: text('isbn'),
    description: text('description').notNull().default(''),
    // ISO 639-1 code such as "cs" or "en". Not an enum: the set of languages is open.
    language: text('language').notNull(),
    condition: bookCondition('condition').notNull(),
    conditionNote: text('condition_note'),
    // Integer minor units (haléře), never floats.
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull().default('CZK'),
    status: bookStatus('status').notNull().default('available'),
    // A reserved book whose reservedUntil has passed counts as available (lazy expiry).
    reservedUntil: timestamp('reserved_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    soldAt: timestamp('sold_at', { withTimezone: true }),
  },
  (t) => [
    index().on(t.status),
    index().on(t.reservedUntil),
    index().on(t.soldAt),
    index().on(t.priceMinor),
    index().on(t.isbn),
    check('books_short_id_format', sql`${t.shortId} ~ '^[0-9a-z]{6,8}$'`),
    check('books_price_not_negative', sql`${t.priceMinor} >= 0`),
    check('books_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    // Without these, a book could be stuck as reserved forever or sold without a date.
    check(
      'books_reserved_has_deadline',
      sql`${t.status} <> 'reserved' OR ${t.reservedUntil} IS NOT NULL`,
    ),
    check(
      'books_sold_has_date',
      sql`${t.status} <> 'sold' OR ${t.soldAt} IS NOT NULL`,
    ),
  ],
)

// Labels live in messages/cs.json under Genres.<key>.
export const genres = pgTable('genres', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  slug: text('slug').notNull().unique(),
})

export const bookGenres = pgTable(
  'book_genres',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.bookId, t.genreId] }),
    // The primary key covers lookups by book. This one covers lookups by genre.
    index().on(t.genreId),
  ],
)

export const bookImages = pgTable(
  'book_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    // Object storage key prefix. The three renditions live under it.
    baseKey: text('base_key').notNull(),
    position: integer('position').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
  },
  (t) => [
    unique().on(t.bookId, t.position),
    // Up to 5 photos per book (spec 6.9).
    check('book_images_position_range', sql`${t.position} BETWEEN 0 AND 4`),
    check('book_images_size_positive', sql`${t.width} > 0 AND ${t.height} > 0`),
  ],
)
