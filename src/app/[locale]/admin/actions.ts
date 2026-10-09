'use server'

import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { setBookHidden } from '@/server/admin/book-status'
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
