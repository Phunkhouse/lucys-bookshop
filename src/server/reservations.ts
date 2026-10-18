import { and, asc, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { displayStatus } from '@/server/availability'
import { isAvailableSql } from '@/server/availability-sql'
import type { db } from '@/server/db/client'
import { books } from '@/server/db/schema'

// The transaction a caller (checkout, M4) opens around the order insert and the
// reservation, so both succeed or fail together.
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Spec 3 and 6.4: a reservation lasts 48 hours.
export const RESERVATION_MS = 48 * 60 * 60 * 1000

export type UnavailableReason = 'reserved' | 'sold' | 'hidden' | 'not_found'

// At least one book of the cart is taken. Nothing was reserved. The caller
// tells the buyer which books are gone.
export class BooksUnavailableError extends Error {
  readonly books: { id: string; reason: UnavailableReason }[]

  constructor(books: { id: string; reason: UnavailableReason }[]) {
    super(`Books not available: ${books.map((b) => b.id).join(', ')}`)
    this.name = 'BooksUnavailableError'
    this.books = books
  }
}

const bookIds = z.array(z.uuid()).min(1)

// Reserves all the given books for an order (spec 6.4), or none of them.
//
// Call it inside the transaction that also inserts the order, with an order row
// that already exists in that transaction (books.reservedByOrderId points at it).
// If anything later in the transaction fails, the reservation rolls back with it.
//
// How it stays safe when two buyers race for the same copy:
// 1. The rows are locked first, in id order. Two carts that share books in
//    opposite order then queue instead of deadlocking. The second buyer waits
//    until the first transaction ends, then sees the committed state.
// 2. With the locks held, every book is checked. If any is taken, the function
//    throws before writing anything, so a caller that catches the error and
//    carries on cannot leave a half-reserved cart behind.
// 3. The write is still the conditional UPDATE ... WHERE <available> from
//    spec 6.4, using the same SQL rule as the catalog (availability-sql.ts).
//    The checks above cannot disagree with it while the locks are held, so a
//    short result there means a bug and throws a plain Error.
//
// Expiry is lazy: a book whose reservation has passed counts as available and is
// simply overwritten, including its old reservedByOrderId.
export async function reserveBooks(
  tx: DbTransaction,
  input: { bookIds: string[]; orderId: string; now: Date },
): Promise<{ reservedUntil: Date }> {
  // Postgres matches uuids case-insensitively but returns them in lowercase, so
  // canonicalize first: otherwise "ABC..." is reported missing and "ABC..." plus
  // "abc..." counts as two books.
  const ids = [
    ...new Set(bookIds.parse(input.bookIds).map((id) => id.toLowerCase())),
  ].sort()

  const rows = await tx
    .select({
      id: books.id,
      status: books.status,
      reservedUntil: books.reservedUntil,
      soldAt: books.soldAt,
    })
    .from(books)
    .where(inArray(books.id, ids))
    .orderBy(asc(books.id))
    .for('update')

  const found = new Map(rows.map((row) => [row.id, row]))
  const unavailable: { id: string; reason: UnavailableReason }[] = []
  for (const id of ids) {
    const row = found.get(id)
    if (!row) {
      unavailable.push({ id, reason: 'not_found' })
      continue
    }
    const current = displayStatus(row, input.now)
    if (current !== 'available') unavailable.push({ id, reason: current })
  }
  if (unavailable.length > 0) throw new BooksUnavailableError(unavailable)

  const reservedUntil = new Date(input.now.getTime() + RESERVATION_MS)
  const updated = await tx
    .update(books)
    .set({
      status: 'reserved',
      reservedUntil,
      reservedByOrderId: input.orderId,
    })
    .where(and(inArray(books.id, ids), isAvailableSql(input.now)))
    .returning({ id: books.id })
  if (updated.length !== ids.length) {
    throw new Error('Reservation update disagreed with the locked check')
  }

  return { reservedUntil }
}
