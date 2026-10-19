'use server'

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import {
  cancelOrder,
  extendReservation,
  markCompleted,
  markPaid,
  markShipped,
  refundOrder,
  setOrderNote,
  setTrackingNumber,
  type CancelResult,
  type CompleteResult,
  type ExtendResult,
  type MarkPaidResult,
  type NoteResult,
  type RefundResult,
  type ShipResult,
  type TrackingResult,
} from '@/server/admin/order-status'

// Thin on purpose (spec 6.9): check the session, check the shape of the input,
// call the service. The rules live in src/server/admin/order-status.ts. What is
// not a string where a string belongs is "not found", never an error page.
const notFound = { outcome: 'refused', reason: 'not_found' } as const
const text = z.string()

export async function markPaidAction(orderId: string): Promise<MarkPaidResult> {
  const actor = await requireAdmin()
  const id = text.safeParse(orderId)
  if (!id.success) return notFound
  return markPaid(actor, id.data, new Date())
}

export async function cancelOrderAction(
  orderId: string,
): Promise<CancelResult> {
  const actor = await requireAdmin()
  const id = text.safeParse(orderId)
  if (!id.success) return notFound
  return cancelOrder(actor, id.data)
}

export async function refundOrderAction(
  orderId: string,
): Promise<RefundResult> {
  const actor = await requireAdmin()
  const id = text.safeParse(orderId)
  if (!id.success) return notFound
  return refundOrder(actor, id.data)
}

export async function extendReservationAction(
  orderId: string,
): Promise<ExtendResult> {
  const actor = await requireAdmin()
  const id = text.safeParse(orderId)
  if (!id.success) return notFound
  return extendReservation(actor, id.data, new Date())
}

export async function markShippedAction(
  orderId: string,
  trackingNumber: string,
): Promise<ShipResult> {
  const actor = await requireAdmin()
  const parsed = z.tuple([text, text]).safeParse([orderId, trackingNumber])
  if (!parsed.success) return notFound
  return markShipped(actor, parsed.data[0], parsed.data[1])
}

export async function setTrackingNumberAction(
  orderId: string,
  trackingNumber: string,
): Promise<TrackingResult> {
  const actor = await requireAdmin()
  const parsed = z.tuple([text, text]).safeParse([orderId, trackingNumber])
  if (!parsed.success) return notFound
  return setTrackingNumber(actor, parsed.data[0], parsed.data[1])
}

export async function markCompletedAction(
  orderId: string,
): Promise<CompleteResult> {
  const actor = await requireAdmin()
  const id = text.safeParse(orderId)
  if (!id.success) return notFound
  return markCompleted(actor, id.data)
}

export async function setOrderNoteAction(
  orderId: string,
  note: string,
): Promise<NoteResult> {
  const actor = await requireAdmin()
  const parsed = z.tuple([text, text]).safeParse([orderId, note])
  if (!parsed.success) return notFound
  return setOrderNote(actor, parsed.data[0], parsed.data[1])
}
