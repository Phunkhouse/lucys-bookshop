import { and, eq, gt, inArray, lt, or, type SQL } from 'drizzle-orm'
import { SOLD_VISIBLE_MS } from './availability'
import { books } from './db/schema'

// SQL versions of the rules in availability.ts. Both must give the same answer
// for every book; availability-sql.int.test.ts checks that against real Postgres.
// `now` is passed in (not SQL now()) so tests control the clock.

// Available, or reserved with a deadline in the past (lazy expiry, spec 6.4).
export function isAvailableSql(now: Date): SQL {
  return or(
    eq(books.status, 'available'),
    and(eq(books.status, 'reserved'), lt(books.reservedUntil, now)),
  )!
}

// Shown in the catalog (spec 6.1): available or reserved, plus books sold less
// than 14 days ago. Hidden books never.
export function isListedSql(now: Date): SQL {
  const soldSince = new Date(now.getTime() - SOLD_VISIBLE_MS)
  return or(
    inArray(books.status, ['available', 'reserved']),
    and(eq(books.status, 'sold'), gt(books.soldAt, soldSince)),
  )!
}
