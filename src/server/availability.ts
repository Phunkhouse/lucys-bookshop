import type { bookStatus } from './db/schema'

type BookStatus = (typeof bookStatus.enumValues)[number]

// The fields these rules need. A full book row fits this shape.
export type AvailabilityFields = {
  status: BookStatus
  reservedUntil: Date | null
  soldAt: Date | null
}

// Sold books stay in the catalog this long (spec 6.1). A fixed 24-hour day, not a calendar day.
export const SOLD_VISIBLE_MS = 14 * 24 * 60 * 60 * 1000

// Reservation expiry is lazy (spec 6.4): there is no job, so "reserved" with a
// deadline in the past means available. At exactly the deadline it is still reserved.
function isReservationExpired(book: AvailabilityFields, now: Date): boolean {
  // A reserved book without a deadline can't happen (database check), but if it
  // did, never offering a possibly taken book is the safe side.
  if (book.reservedUntil === null) return false
  return book.reservedUntil.getTime() < now.getTime()
}

export function displayStatus(book: AvailabilityFields, now: Date): BookStatus {
  if (book.status === 'reserved' && isReservationExpired(book, now)) {
    return 'available'
  }
  return book.status
}

export function isBuyable(book: AvailabilityFields, now: Date): boolean {
  return displayStatus(book, now) === 'available'
}

export function isListedInCatalog(
  book: AvailabilityFields,
  now: Date,
): boolean {
  switch (displayStatus(book, now)) {
    case 'available':
    case 'reserved':
      return true
    case 'sold':
      // Sold books with an unknown date are not shown, and the 14 days are exclusive.
      return (
        book.soldAt !== null &&
        book.soldAt.getTime() > now.getTime() - SOLD_VISIBLE_MS
      )
    case 'hidden':
      return false
  }
}
