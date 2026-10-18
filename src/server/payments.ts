import { asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db/client'
import { books, orderItems, orders } from './db/schema'
import { conflictingBooks } from './order-conflicts'
import type { UnavailableReason } from './reservations'

export type ConflictBook = {
  id: string
  title: string
  reason: Exclude<UnavailableReason, 'not_found'>
}

export type ConfirmResult =
  // This call made the order paid and sold its books.
  | { status: 'paid' }
  // Paid already (also shipped or completed). Nothing was changed.
  | { status: 'already_paid' }
  // Cancelled or refunded: paying it needs a human decision.
  | { status: 'not_payable'; orderStatus: 'cancelled' | 'refunded' }
  // A late payment (reservation over) and someone else got a book meanwhile.
  // Nothing was changed: the seller refunds by hand and cancels (spec 6.4).
  | { status: 'conflict'; books: ConflictBook[] }
  | { status: 'not_found' }

// How an order becomes paid (spec 6.6). v1 has one implementation, the seller's
// manual confirmation. A CSV statement import or a bank API plugs in behind
// the same interface. The caller decides who may confirm: the admin action
// checks the session before calling this.
//
// Contract for every implementation: safe to call twice (or for the same bank
// transaction twice) and safe when calls overlap.
export interface PaymentConfirmer {
  confirm(orderId: string, now: Date): Promise<ConfirmResult>
}

const PAID_STATUSES = ['paid', 'shipped', 'completed'] as const

export const manualPaymentConfirmer: PaymentConfirmer = {
  confirm: (orderId, now) => markOrderPaid(orderId, now),
}

// Marks an order paid and its books sold, in one transaction.
//
// - The order row is locked first, so overlapping confirmations queue and the
//   later ones see "paid" and do nothing.
// - Then its books are locked in id order, like checkout does, so a late
//   payment and a new buyer cannot both get a book: whoever locks first wins
//   and the other sees the committed state.
// - A book is ours if the order still holds it (reservedByOrderId), even past
//   the deadline: nobody took it, so it is sold, which is the "re-reserve and
//   sell" of spec 6.4 in one step. Otherwise the book must be free by the
//   catalog rule (available, or another reservation that has lapsed).
// - If any book is not ours and not free, nothing is written.
async function markOrderPaid(
  orderId: string,
  now: Date,
): Promise<ConfirmResult> {
  if (!z.uuid().safeParse(orderId).success) return { status: 'not_found' }

  return db.transaction(async (tx) => {
    // NO KEY UPDATE: blocks other confirmations, but not the foreign key
    // checks of a checkout that points a book at this order.
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for('no key update')
    if (!order) return { status: 'not_found' }

    if ((PAID_STATUSES as readonly string[]).includes(order.status)) {
      return { status: 'already_paid' }
    }
    if (order.status !== 'pending_payment') {
      return {
        status: 'not_payable',
        orderStatus: order.status as 'cancelled' | 'refunded',
      }
    }

    const items = await tx
      .select({ bookId: orderItems.bookId })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
    const rows = await tx
      .select()
      .from(books)
      .where(
        inArray(
          books.id,
          items.map((item) => item.bookId),
        ),
      )
      .orderBy(asc(books.id))
      .for('update')

    const conflicts = conflictingBooks(order.id, rows, now)
    if (conflicts.length > 0) return { status: 'conflict', books: conflicts }

    await tx
      .update(books)
      .set({
        status: 'sold',
        soldAt: now,
        reservedUntil: null,
        reservedByOrderId: order.id,
      })
      .where(
        inArray(
          books.id,
          rows.map((book) => book.id),
        ),
      )
    await tx
      .update(orders)
      .set({ status: 'paid', paidAt: now })
      .where(eq(orders.id, order.id))

    return { status: 'paid' }
  })
}
