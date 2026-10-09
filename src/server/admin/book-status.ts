import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AdminActor } from '@/server/auth/require-admin'
import { displayStatus } from '@/server/availability'
import { isAvailableSql } from '@/server/availability-sql'
import { db } from '@/server/db/client'
import { books } from '@/server/db/schema'

export type SetHiddenResult =
  | { outcome: 'changed' }
  // Already in the wanted state. Nothing is written, so updatedAt stays.
  | { outcome: 'unchanged' }
  | { outcome: 'refused'; reason: 'reserved' | 'sold' | 'not_found' }

const bookId = z.uuid()

// Hides an available book, or shows a hidden one again (spec 6.9). The rule is
// the WHERE clause of one UPDATE, never a read followed by a write: a buyer who
// reserves the book between the admin's page load and the click must win, so
// this either changes the row in one step or leaves it alone.
//
// Reserved and sold books are not touched. A reservation ends by expiry or by
// cancelling the order (M5), and a sold book's shared link must keep working.
export async function setBookHidden(
  _actor: AdminActor,
  id: string,
  hidden: boolean,
  now: Date,
): Promise<SetHiddenResult> {
  if (!bookId.safeParse(id).success) {
    return { outcome: 'refused', reason: 'not_found' }
  }

  // A second attempt covers the rare case where the book changed state between
  // the UPDATE and the lookup that explains why it did not apply.
  for (let attempt = 0; attempt < 2; attempt++) {
    const updated = hidden
      ? await db
          .update(books)
          .set({ status: 'hidden', reservedUntil: null })
          .where(and(eq(books.id, id), isAvailableSql(now)))
          .returning({ id: books.id })
      : await db
          .update(books)
          .set({ status: 'available' })
          .where(and(eq(books.id, id), eq(books.status, 'hidden')))
          .returning({ id: books.id })
    if (updated.length > 0) return { outcome: 'changed' }

    const [row] = await db
      .select({
        status: books.status,
        reservedUntil: books.reservedUntil,
        soldAt: books.soldAt,
      })
      .from(books)
      .where(eq(books.id, id))
    if (!row) return { outcome: 'refused', reason: 'not_found' }

    const current = displayStatus(row, now)
    if (current === 'reserved' || current === 'sold') {
      return { outcome: 'refused', reason: current }
    }
    if ((current === 'hidden') === hidden) return { outcome: 'unchanged' }
    // Otherwise the state moved under us and the update would now succeed: retry.
  }
  throw new Error('Book status kept changing while it was being updated')
}
