'use server'

import { requireAdmin } from '@/lib/auth'
import type {
  SettingsFormResult,
  SettingsFormValues,
} from '@/lib/settings-form-schema'
import { updateSettings } from '@/server/admin/settings'

export async function updateSettingsAction(
  values: SettingsFormValues,
): Promise<SettingsFormResult> {
  const actor = await requireAdmin()
  return updateSettings(actor, values)
}
