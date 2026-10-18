import { asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { AdminActor } from '@/server/auth/require-admin'
import { db } from '@/server/db/client'
import { books, orderItems, orders } from '@/server/db/schema'
import { conflictingBooks, type ConflictBook } from '@/server/order-conflicts'
import {
  canExtend,
  canTransition,
  extendedDeadline,
  normalizeNote,
  normalizeTrackingNumber,
} from '@/server/order-transitions'
import type { DbTransaction } from '@/server/reservations'

// The admin's order actions (spec 6.4, 6.7, 6.9). Every one follows the same
// pattern as markOrderPaid:
// - The order row is locked first, so two actions on one order queue, and the
//   later one sees the committed state and refuses or does nothing.
// - Then the order's books are locked in id order, like checkout does, so a
//   change here and a buyer reserving a book cannot interleave.
// - A book is changed only if this order still holds it (reservedByOrderId).
//   Expiry is lazy, so a book of an old order may already belong to a newer one.
// - Calling an action twice is safe: the second call reports `unchanged`.
// The caller proves the admin session by passing an AdminActor.

const orderId = z.uuid()

type OrderRow = typeof orders.$inferSelect

type Refused<Reason extends string> = { outcome: 'refused'; reason: Reason }

export type CancelResult =
  | { outcome: 'cancelled' }
  | { outcome: 'unchanged' }
  | Refused<'not_cancellable' | 'not_found'>

export type RefundResult =
  | { outcome: 'refunded' }
  | { outcome: 'unchanged' }
  | Refused<'not_refundable' | 'not_found'>

export type ExtendResult =
  | { outcome: 'extended'; expiresAt: Date }
  // A book went to someone else meanwhile. Nothing was changed.
  | { outcome: 'conflict'; books: ConflictBook[] }
  | Refused<'not_extendable' | 'not_found'>

export type ShipResult =
  | { outcome: 'shipped' }
  | { outcome: 'unchanged' }
  | Refused<'not_shippable' | 'invalid_tracking' | 'not_found'>

export type CompleteResult =
  | { outcome: 'completed' }
  | { outcome: 'unchanged' }
  | Refused<'not_completable' | 'not_found'>

export type NoteResult =
  { outcome: 'saved' } | Refused<'invalid_note' | 'not_found'>

async function lockOrder(tx: DbTransaction, id: string) {
  // NO KEY UPDATE: blocks other actions on the order, but not the foreign key
  // checks of a checkout that points a book at it.
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .for('no key update')
  return order as OrderRow | undefined
}

async function lockBooksOf(tx: DbTransaction, order: OrderRow) {
  const items = await tx
    .select({ bookId: orderItems.bookId })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
  return tx
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
}

// Puts the books this order still holds back on sale.
async function releaseBooks(
  tx: DbTransaction,
  order: OrderRow,
  held: 'reserved' | 'sold',
) {
  const ours = (await lockBooksOf(tx, order)).filter(
    (book) => book.status === held && book.reservedByOrderId === order.id,
  )
  if (ours.length === 0) return
  await tx
    .update(books)
    .set({
      status: 'available',
      reservedUntil: null,
      reservedByOrderId: null,
      soldAt: null,
    })
    .where(
      inArray(
        books.id,
        ours.map((book) => book.id),
      ),
    )
}

// Cancels an unpaid order, expired or not, and frees its books.
export async function cancelOrder(
  _actor: AdminActor,
  id: string,
): Promise<CancelResult> {
  if (!orderId.safeParse(id).success) {
    return { outcome: 'refused', reason: 'not_found' }
  }
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, id)
    if (!order) return { outcome: 'refused', reason: 'not_found' }
    if (order.status === 'cancelled') return { outcome: 'unchanged' }
    if (!canTransition(order.status, 'cancelled', order.shippingMethod)) {
      return { outcome: 'refused', reason: 'not_cancellable' }
    }
    await releaseBooks(tx, order, 'reserved')
    await tx
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, order.id))
    return { outcome: 'cancelled' }
  })
}

// Records a refund the seller made from her bank (spec 6.6) and puts the books
// back on sale.
export async function refundOrder(
  _actor: AdminActor,
  id: string,
): Promise<RefundResult> {
  if (!orderId.safeParse(id).success) {
    return { outcome: 'refused', reason: 'not_found' }
  }
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, id)
    if (!order) return { outcome: 'refused', reason: 'not_found' }
    if (order.status === 'refunded') return { outcome: 'unchanged' }
    if (!canTransition(order.status, 'refunded', order.shippingMethod)) {
      return { outcome: 'refused', reason: 'not_refundable' }
    }
    await releaseBooks(tx, order, 'sold')
    await tx
      .update(orders)
      .set({ status: 'refunded' })
      .where(eq(orders.id, order.id))
    return { outcome: 'refunded' }
  })
}

// Extends a waiting cash on pickup reservation by 48 hours (spec 6.4). If the
// deadline has passed, the books are re-reserved, unless someone else took one:
// then nothing changes and the conflict is reported. A book whose lapsed
// reservation belonged to another order is free by the lazy-expiry rule, so it
// is taken over and that order's reservedByOrderId link is overwritten, as in
// checkout and markOrderPaid.
export async function extendReservation(
  _actor: AdminActor,
  id: string,
  now: Date,
): Promise<ExtendResult> {
  if (!orderId.safeParse(id).success) {
    return { outcome: 'refused', reason: 'not_found' }
  }
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, id)
    if (!order) return { outcome: 'refused', reason: 'not_found' }
    if (!canExtend(order)) {
      return { outcome: 'refused', reason: 'not_extendable' }
    }

    const rows = await lockBooksOf(tx, order)
    const conflicts = conflictingBooks(order.id, rows, now)
    if (conflicts.length > 0) return { outcome: 'conflict', books: conflicts }

    const expiresAt = extendedDeadline(now, order.expiresAt)
    await tx
      .update(books)
      .set({
        status: 'reserved',
        reservedUntil: expiresAt,
        reservedByOrderId: order.id,
      })
      .where(
        inArray(
          books.id,
          rows.map((book) => book.id),
        ),
      )
    await tx.update(orders).set({ expiresAt }).where(eq(orders.id, order.id))
    return { outcome: 'extended', expiresAt }
  })
}

// Marks a paid Zásilkovna order shipped and keeps the tracking number the
// seller pasted from the Zásilkovna app. Pickup orders are never shipped.
export async function markShipped(
  _actor: AdminActor,
  id: string,
  trackingNumber: string,
): Promise<ShipResult> {
  if (!orderId.safeParse(id).success) {
    return { outcome: 'refused', reason: 'not_found' }
  }
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, id)
    if (!order) return { outcome: 'refused', reason: 'not_found' }
    if (order.status === 'shipped') return { outcome: 'unchanged' }
    if (!canTransition(order.status, 'shipped', order.shippingMethod)) {
      return { outcome: 'refused', reason: 'not_shippable' }
    }
    const tracking = normalizeTrackingNumber(trackingNumber)
    if (tracking === null) {
      return { outcome: 'refused', reason: 'invalid_tracking' }
    }
    await tx
      .update(orders)
      .set({ status: 'shipped', trackingNumber: tracking })
      .where(eq(orders.id, order.id))
    return { outcome: 'shipped' }
  })
}

// Delivered or handed over. Manual, never automatic.
export async function markCompleted(
  _actor: AdminActor,
  id: string,
): Promise<CompleteResult> {
  if (!orderId.safeParse(id).success) {
    return { outcome: 'refused', reason: 'not_found' }
  }
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, id)
    if (!order) return { outcome: 'refused', reason: 'not_found' }
    if (order.status === 'completed') return { outcome: 'unchanged' }
    if (!canTransition(order.status, 'completed', order.shippingMethod)) {
      return { outcome: 'refused', reason: 'not_completable' }
    }
    await tx
      .update(orders)
      .set({ status: 'completed' })
      .where(eq(orders.id, order.id))
    return { outcome: 'completed' }
  })
}

// The seller's free-text note (underpayment, a wrong variable symbol, ...).
// Allowed in every status. An empty note clears it. A plain UPDATE without the
// order lock on purpose: it writes only `note`, so it cannot race with the
// status logic. Keep it that way: anything touching status or books belongs
// in a locked transaction like the actions above.
export async function setOrderNote(
  _actor: AdminActor,
  id: string,
  note: string,
): Promise<NoteResult> {
  if (!orderId.safeParse(id).success) {
    return { outcome: 'refused', reason: 'not_found' }
  }
  const parsed = normalizeNote(note)
  if (!parsed.ok) return { outcome: 'refused', reason: 'invalid_note' }

  const updated = await db
    .update(orders)
    .set({ note: parsed.value })
    .where(eq(orders.id, id))
    .returning({ id: orders.id })
  if (updated.length === 0) return { outcome: 'refused', reason: 'not_found' }
  return { outcome: 'saved' }
}
