import { displayStatus, type AvailabilityFields } from './availability'
import type { ConflictBook } from './payments'

export type HeldBook = AvailabilityFields & {
  id: string
  title: string
  reservedByOrderId: string | null
}

// The books of an unpaid order that someone else has by now (spec 6.4, late
// payment). One rule for the admin page, "mark paid" and "extend", so the
// warning shows exactly what those would refuse.
//
// A book the order still holds is ours even past the deadline: nobody took it.
// Otherwise it must be free by the catalog rule (available, or another
// order's reservation that has lapsed).
export function conflictingBooks(
  orderId: string,
  rows: HeldBook[],
  now: Date,
): ConflictBook[] {
  const conflicts: ConflictBook[] = []
  for (const book of rows) {
    const stillOurs =
      book.status === 'reserved' && book.reservedByOrderId === orderId
    if (stillOurs) continue
    const current = displayStatus(book, now)
    if (current !== 'available') {
      conflicts.push({ id: book.id, title: book.title, reason: current })
    }
  }
  return conflicts
}
