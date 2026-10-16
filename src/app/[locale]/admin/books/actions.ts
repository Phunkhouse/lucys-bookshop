'use server'

import { requireAdmin } from '@/lib/auth'
import { storage } from '@/lib/storage'
import type { BookFormResult, BookFormValues } from '@/lib/book-form-schema'
import { createListing, updateListing } from '@/server/admin/book-listing'
import { createUploadTicket } from '@/server/storage/upload-ticket'

export async function createBookAction(
  values: BookFormValues,
): Promise<BookFormResult> {
  const actor = await requireAdmin()
  const result = await createListing(actor, values, { storage })
  return result.ok ? { ok: true } : { ok: false, errors: result.errors }
}

export async function updateBookAction(
  bookId: string,
  values: BookFormValues,
): Promise<BookFormResult> {
  const actor = await requireAdmin()
  const result = await updateListing(actor, bookId, values, { storage })
  if (result.ok) return { ok: true }
  if (result.reason === 'not_found') {
    return { ok: false, errors: { form: 'notFound' } }
  }
  return { ok: false, errors: result.errors }
}

// Permission to upload one photo: the browser gets three short-lived URLs for the
// staging area, and sends the three sizes straight to the storage.
export async function createUploadTicketAction() {
  const actor = await requireAdmin()
  const ticket = await createUploadTicket(actor, storage, new Date())
  return {
    uploadId: ticket.uploadId,
    expiresAt: ticket.expiresAt.toISOString(),
    urls: ticket.urls,
  }
}
