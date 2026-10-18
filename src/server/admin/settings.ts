import { db } from '@/server/db/client'
import { settings } from '@/server/db/schema'
import type { AdminActor } from '@/server/auth/require-admin'
import {
  parseSettingsForm,
  type SettingsFormErrors,
} from '@/lib/settings-form-schema'

export type UpdateSettingsResult =
  { ok: true } | { ok: false; errors: SettingsFormErrors }

// Saves the shop settings (spec 6.9). There is one row, id 1, written with a
// single INSERT ... ON CONFLICT so the first save and every later one take the
// same path, and two saves at once cannot create a second row.
//
// An empty price is stored as null: Zásilkovna is then not offered at checkout.
export async function updateSettings(
  _actor: AdminActor,
  input: unknown,
): Promise<UpdateSettingsResult> {
  const parsed = parseSettingsForm(input)
  if (!parsed.ok) return parsed

  const { zasilkovnaPriceMinor, pickupInstructions } = parsed.data
  await db
    .insert(settings)
    .values({ id: 1, zasilkovnaPriceMinor, pickupInstructions })
    .onConflictDoUpdate({
      target: settings.id,
      set: { zasilkovnaPriceMinor, pickupInstructions, updatedAt: new Date() },
    })
  return { ok: true }
}
