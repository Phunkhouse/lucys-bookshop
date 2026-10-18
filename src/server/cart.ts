import { inArray } from 'drizzle-orm'
import { classifyCartLine, subtotalMinor, type CartLine } from './cart-rules'
import type { CartInput } from '@/lib/cart-schema'
import { imagesByBook } from './catalog'
import { db } from './db/client'
import { books } from './db/schema'

export type CartValidation = {
  lines: CartLine[]
  subtotalMinor: number
  currency: string
}

// Re-checks a cart against the database (spec 6.3). Read-only: it reserves
// nothing, so the answer can be stale a moment later. Checkout (M4) reserves
// with reserveBooks, which is the only place that decides who gets a book.
//
// Lines come back in the order given; a repeated book counts once. Pass input
// that cartInputSchema has accepted.
export async function validateCart(
  input: CartInput,
  now: Date,
): Promise<CartValidation> {
  const items = [...new Map(input.map((item) => [item.shortId, item])).values()]
  if (items.length === 0) {
    return { lines: [], subtotalMinor: 0, currency: 'CZK' }
  }

  const rows = await db
    .select()
    .from(books)
    .where(
      inArray(
        books.shortId,
        items.map((item) => item.shortId),
      ),
    )
  const byShortId = new Map(rows.map((row) => [row.shortId, row]))
  const images = await imagesByBook(rows.map((row) => row.id))

  const lines = items.map((item) => {
    const row = byShortId.get(item.shortId)
    return classifyCartLine(
      item,
      row,
      now,
      row ? (images.get(row.id)?.[0] ?? null) : null,
    )
  })

  const currencies = new Set(
    lines.flatMap((line) => (line.kind === 'gone' ? [] : [line.currency])),
  )
  if (currencies.size > 1) {
    throw new Error('A cart cannot mix currencies')
  }

  return {
    lines,
    subtotalMinor: subtotalMinor(lines),
    currency: [...currencies][0] ?? 'CZK',
  }
}
