'use server'

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { storage } from '@/lib/storage'
import { deleteBook } from '@/server/admin/book-delete'
import { setBookHidden } from '@/server/admin/book-status'
import { removeImages } from '@/server/storage/remove-images'
import type { SetHiddenResult } from '@/server/admin/book-status'

const input = z.object({ bookId: z.string(), hidden: z.boolean() })

export async function setBookHiddenAction(
  bookId: string,
  hidden: boolean,
): Promise<SetHiddenResult> {
  const actor = await requireAdmin()
  const parsed = input.safeParse({ bookId, hidden })
  if (!parsed.success) return { outcome: 'refused', reason: 'not_found' }
  return setBookHidden(
    actor,
    parsed.data.bookId,
    parsed.data.hidden,
    new Date(),
  )
}

// What the browser learns: the outcome only. The photo keys stay on the server.
export type DeleteBookActionResult =
  | { outcome: 'deleted' }
  | {
      outcome: 'refused'
      reason: Extract<
        Awaited<ReturnType<typeof deleteBook>>,
        { outcome: 'refused' }
      >['reason']
    }

export async function deleteBookAction(
  bookId: string,
): Promise<DeleteBookActionResult> {
  const actor = await requireAdmin()
  const parsed = z.string().safeParse(bookId)
  if (!parsed.success) return { outcome: 'refused', reason: 'not_found' }

  const result = await deleteBook(actor, parsed.data, new Date())
  if (result.outcome === 'deleted') {
    // The book is gone; now its photo files. A failure here is harmless
    // leftovers, so it does not undo the delete.
    await removeImages(storage, result.imageKeys)
    return { outcome: 'deleted' }
  }
  return result
}
