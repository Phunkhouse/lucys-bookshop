import type { CartInput } from '@/lib/cart-schema'
import { displayStatus, type AvailabilityFields } from './availability'
import type { ImageRef } from './catalog'

// The stored fields a cart line needs.
export type CartBook = AvailabilityFields & {
  shortId: string
  title: string
  author: string
  priceMinor: number
  currency: string
}

type Listed = {
  shortId: string
  title: string
  author: string
  currency: string
  cover: ImageRef | null
}

// One line of the cart as the server sees it now (spec 6.3):
// - ok: buyable at the price the buyer saw.
// - price_changed: buyable, but the buyer must confirm the new price.
// - unavailable: reserved by someone else or sold; the title is kept so the
//   buyer knows what was removed.
// - gone: hidden or unknown. Nothing about the book is revealed.
export type CartLine =
  | (Listed & { kind: 'ok'; priceMinor: number })
  | (Listed & {
      kind: 'price_changed'
      priceMinor: number
      seenPriceMinor: number
    })
  | (Listed & { kind: 'unavailable'; reason: 'reserved' | 'sold' })
  | { kind: 'gone'; shortId: string }

export function classifyCartLine(
  item: CartInput[number],
  book: CartBook | undefined,
  now: Date,
  cover: ImageRef | null,
): CartLine {
  if (!book) return { kind: 'gone', shortId: item.shortId }

  const status = displayStatus(book, now)
  if (status === 'hidden') return { kind: 'gone', shortId: item.shortId }

  const listed: Listed = {
    shortId: book.shortId,
    title: book.title,
    author: book.author,
    currency: book.currency,
    cover,
  }
  if (status === 'reserved' || status === 'sold') {
    return { ...listed, kind: 'unavailable', reason: status }
  }
  if (book.priceMinor !== item.priceMinorSeen) {
    return {
      ...listed,
      kind: 'price_changed',
      priceMinor: book.priceMinor,
      seenPriceMinor: item.priceMinorSeen,
    }
  }
  return { ...listed, kind: 'ok', priceMinor: book.priceMinor }
}

// Server prices of the books that can still be bought. A changed price counts
// at its new value: that is what checkout would charge.
export function subtotalMinor(lines: CartLine[]): number {
  let total = 0
  for (const line of lines) {
    if (line.kind === 'ok' || line.kind === 'price_changed') {
      total += line.priceMinor
    }
  }
  return total
}
