import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
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
    // The order that holds the reservation. Stale once the reservation expires
    // (lazy expiry), and nullable because seed and admin data reserve without an order.
    reservedByOrderId: uuid('reserved_by_order_id').references(
      (): AnyPgColumn => orders.id,
    ),
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
    index().on(t.reservedByOrderId),
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

export * from './auth-schema'

export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'paid',
  'shipped',
  'completed',
  'cancelled',
  'refunded',
])

export const paymentMethod = pgEnum('payment_method', [
  'bank_transfer',
  'cash_on_pickup',
])

export const shippingMethod = pgEnum('shipping_method', [
  'pickup',
  'zasilkovna',
])

// Created at checkout (M4); this table only exists in M3 so reservations have
// something to point at. An order is a snapshot: later edits to a book never
// change it (spec 6.7).
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Human-readable, year plus sequence (20260001). Also the variable symbol,
    // so digits only and at most 10 of them.
    number: integer('number').notNull().unique(),
    // Unguessable, in the buyer's order page link (/order/<token>).
    publicToken: text('public_token').notNull().unique(),
    status: orderStatus('status').notNull().default('pending_payment'),
    paymentMethod: paymentMethod('payment_method').notNull(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    shippingMethod: shippingMethod('shipping_method').notNull(),
    // Pickup point typed by the buyer for Zásilkovna; empty for personal pickup.
    shippingDetails: text('shipping_details'),
    // Integer minor units (haléře), never floats.
    shippingCostMinor: integer('shipping_cost_minor').notNull(),
    totalMinor: integer('total_minor').notNull(),
    currency: text('currency').notNull().default('CZK'),
    locale: text('locale').notNull().default('cs'),
    // End of the 48 h reservation (extended by the seller for cash on pickup).
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    sellerRemindedAt: timestamp('seller_reminded_at', { withTimezone: true }),
    trackingNumber: text('tracking_number'),
    note: text('note'),
    // Chosen by the browser per checkout attempt, so a double click returns
    // the same order instead of a second one (M4). Unique; null only on rows
    // that predate it.
    checkoutKey: text('checkout_key').unique(),
    // When the buyer ticked the terms and privacy boxes (spec 6.5).
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => [
    index().on(t.status),
    index().on(t.expiresAt),
    index().on(t.createdAt),
    check('orders_number_format', sql`${t.number} BETWEEN 1 AND 2147483647`),
    check(
      'orders_amounts_not_negative',
      sql`${t.shippingCostMinor} >= 0 AND ${t.totalMinor} >= 0`,
    ),
    check('orders_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    // Without this, a paid order could exist with no record of when.
    check(
      'orders_paid_has_date',
      sql`${t.status} NOT IN ('paid', 'shipped', 'completed') OR ${t.paidAt} IS NOT NULL`,
    ),
  ],
)

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    // Restricting on purpose: a book that was ever ordered cannot be deleted (spec 6.9).
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id),
    titleSnapshot: text('title_snapshot').notNull(),
    priceMinorSnapshot: integer('price_minor_snapshot').notNull(),
  },
  (t) => [
    // One copy, one line: a book is in an order at most once.
    unique().on(t.orderId, t.bookId),
    index().on(t.bookId),
    check('order_items_price_not_negative', sql`${t.priceMinorSnapshot} >= 0`),
  ],
)

// Last sequence number used per year. The order number is year * 10000 + last
// (20260001), taken with an atomic upsert inside the checkout transaction, so a
// rollback leaves no gap and two checkouts never share a number.
export const orderCounters = pgTable(
  'order_counters',
  {
    year: integer('year').primaryKey(),
    last: integer('last').notNull().default(0),
  },
  (t) => [
    // Four digits of sequence per year; the next order fails loudly, not wrongly.
    check('order_counters_last_range', sql`${t.last} BETWEEN 0 AND 9999`),
    check('order_counters_year_range', sql`${t.year} BETWEEN 2000 AND 9999`),
  ],
)

// Shop settings (spec 6.9): exactly one row, id 1, written by the admin page.
// No row, or a null price, means "not set up yet": Zásilkovna is then not
// offered at checkout rather than offered for free.
export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    zasilkovnaPriceMinor: integer('zasilkovna_price_minor'),
    pickupInstructions: text('pickup_instructions').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('settings_single_row', sql`${t.id} = 1`),
    check(
      'settings_price_not_negative',
      sql`${t.zasilkovnaPriceMinor} IS NULL OR ${t.zasilkovnaPriceMinor} >= 0`,
    ),
  ],
)

// Attempt counters for rate limiting (spec 8), one row per key and window.
// The key holds a keyed hash of the address, never the address.
export const requestLimits = pgTable(
  'request_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    // For the cleanup of old windows.
    index().on(t.windowStart),
    check('request_limits_count_positive', sql`${t.count} >= 1`),
  ],
)
