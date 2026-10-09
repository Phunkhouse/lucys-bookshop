'use server'

import { requireAdmin } from '@/lib/auth'
import type { BookFormResult, BookFormValues } from '@/lib/book-form-schema'
import { createListing, updateListing } from '@/server/admin/book-listing'

export async function createBookAction(
  values: BookFormValues,
): Promise<BookFormResult> {
  const actor = await requireAdmin()
  const result = await createListing(actor, values)
  return result.ok ? { ok: true } : { ok: false, errors: result.errors }
}

export async function updateBookAction(
  bookId: string,
  values: BookFormValues,
): Promise<BookFormResult> {
  const actor = await requireAdmin()
  const result = await updateListing(actor, bookId, values)
  if (result.ok) return { ok: true }
  if (result.reason === 'not_found') {
    return { ok: false, errors: { form: 'notFound' } }
  }
  return { ok: false, errors: result.errors }
}
