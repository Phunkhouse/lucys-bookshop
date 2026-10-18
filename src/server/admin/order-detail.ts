import { asc, eq, inArray } from 'drizzle-orm'
import type { AdminActor } from '@/server/auth/require-admin'
import { db } from '@/server/db/client'
import { books, orderItems, orders } from '@/server/db/schema'
import { conflictingBooks, type ConflictBook } from '@/server/order-conflicts'
import {
  isExpiringSoon,
  orderStage,
  type OrderStage,
} from '@/server/order-stage'

export type AdminOrderDetail = {
  id: string
  number: number
  // For the buyer's order page link in the "write to buyer" message.
  publicToken: string
  stage: OrderStage
  expiringSoon: boolean
  name: string
  email: string
  phone: string
  paymentMethod: 'bank_transfer' | 'cash_on_pickup'
  shippingMethod: 'pickup' | 'zasilkovna'
  shippingDetails: string | null
  trackingNumber: string | null
  shippingCostMinor: number
  totalMinor: number
  currency: string
  note: string | null
  createdAt: Date
  paidAt: Date | null
  expiresAt: Date
  // As placed: later edits to a book never change them (spec 6.7).
  items: { bookId: string; title: string; priceMinor: number }[]
  // Books an unpaid order no longer holds, so "mark paid" would refuse.
  conflicts: ConflictBook[]
}

// The order behind an admin link, or null. Read-only: the actions come with
// the admin order buttons.
//
// The order, its items and its books are read separately, outside one
// transaction, so `conflicts` is advisory: it is how things looked a moment
// ago. The actions that change the order re-check under row locks and have the
// last word. The actor is the proof that the caller went through requireAdmin(),
// even though nothing here reads it.
export async function getAdminOrder(
  _actor: AdminActor,
  number: number,
  now: Date,
): Promise<AdminOrderDetail | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.number, number))
  if (!order) return null

  const items = await db
    .select({
      bookId: orderItems.bookId,
      title: orderItems.titleSnapshot,
      priceMinor: orderItems.priceMinorSnapshot,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.titleSnapshot), asc(orderItems.bookId))

  // Only an order waiting for payment can be in conflict; for the others the
  // books are sold, released or no longer anyone's concern.
  let conflicts: ConflictBook[] = []
  if (order.status === 'pending_payment' && items.length > 0) {
    const rows = await db
      .select()
      .from(books)
      .where(
        inArray(
          books.id,
          items.map((item) => item.bookId),
        ),
      )
      .orderBy(asc(books.id))
    conflicts = conflictingBooks(order.id, rows, now)
  }

  const stage = orderStage(order.status, order.expiresAt, now)
  return {
    id: order.id,
    number: order.number,
    publicToken: order.publicToken,
    stage,
    expiringSoon: isExpiringSoon(stage, order.expiresAt, now),
    name: order.name,
    email: order.email,
    phone: order.phone,
    paymentMethod: order.paymentMethod,
    shippingMethod: order.shippingMethod,
    shippingDetails: order.shippingDetails,
    trackingNumber: order.trackingNumber,
    shippingCostMinor: order.shippingCostMinor,
    totalMinor: order.totalMinor,
    currency: order.currency,
    note: order.note,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    expiresAt: order.expiresAt,
    items,
    conflicts,
  }
}
