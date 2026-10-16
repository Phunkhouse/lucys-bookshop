import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AdminActor } from '@/server/auth/require-admin'
import { displayStatus } from '@/server/availability'
import { db } from '@/server/db/client'
import { bookImages, books } from '@/server/db/schema'

export type DeleteBookResult =
  | {
      outcome: 'deleted'
      // Storage keys of the photos. The rows are gone with the book, so the
      // caller removes the files (the database goes first: files without a
      // book are harmless, a book without its files is a broken page).
      imageKeys: string[]
    }
  | {
      outcome: 'refused'
      // has_orders is for M3: an order item will point at the book with a
      // restricting foreign key, and the database refusing becomes this reason.
      reason: 'not_hidden' | 'reserved' | 'sold' | 'has_orders' | 'not_found'
    }

const bookId = z.uuid()

// Only a hidden book can be deleted (spec 6.9). A hidden book is already gone
// from the shop, so nothing breaks; a live listing has to be hidden first, and a
// sold book stays because its shared link must keep working.
//
// The row is locked first, so the check, the list of photos and the delete see
// the same book: a "show again" or a new photo arriving at the same moment
// waits and then finds the answer has changed.
export async function deleteBook(
  _actor: AdminActor,
  id: string,
  now: Date,
): Promise<DeleteBookResult> {
  if (!bookId.safeParse(id).success) {
    return { outcome: 'refused', reason: 'not_found' }
  }

  return db.transaction(async (tx): Promise<DeleteBookResult> => {
    const [book] = await tx
      .select({
        status: books.status,
        reservedUntil: books.reservedUntil,
        soldAt: books.soldAt,
      })
      .from(books)
      .where(eq(books.id, id))
      .for('update')
    if (!book) return { outcome: 'refused', reason: 'not_found' }

    const current = displayStatus(book, now)
    if (current === 'reserved' || current === 'sold') {
      return { outcome: 'refused', reason: current }
    }
    // An available book, or one whose reservation has expired.
    if (current !== 'hidden')
      return { outcome: 'refused', reason: 'not_hidden' }

    const images = await tx
      .select({ baseKey: bookImages.baseKey })
      .from(bookImages)
      .where(eq(bookImages.bookId, id))
      .orderBy(asc(bookImages.position))

    // Genre links and photo rows go with it (ON DELETE CASCADE).
    await tx.delete(books).where(eq(books.id, id))
    return { outcome: 'deleted', imageKeys: images.map((i) => i.baseKey) }
  })
}
