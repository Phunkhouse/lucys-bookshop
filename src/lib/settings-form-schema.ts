import { z } from 'zod'
import { parsePriceToMinor } from './price'

// One definition of a valid settings form (spec 6.9), used by the browser for
// instant feedback and by the server, which always checks again. Problems are
// plain keys; the Czech text lives in messages/cs.json under Admin.settings.

export const PICKUP_INSTRUCTIONS_MAX = 500

export type SettingsFormValues = {
  // As typed. Empty means "not set": Zásilkovna is then not offered.
  zasilkovnaPrice: string
  pickupInstructions: string
}

export const SETTINGS_ERROR_KEYS = [
  'invalid',
  'tooLong',
  'priceInvalid',
  'priceDecimals',
  'pricePositive',
  'priceTooHigh',
  'saveFailed',
] as const

export type SettingsFormField = keyof SettingsFormValues
export type SettingsFormErrors = Partial<
  Record<SettingsFormField | 'form', string>
>
export type SettingsFormResult =
  { ok: true } | { ok: false; errors: SettingsFormErrors }

const settingsFormSchema = z.object({
  zasilkovnaPrice: z.string({ error: 'invalid' }).transform((text, ctx) => {
    if (text.trim() === '') return null
    const result = parsePriceToMinor(text)
    if (result.ok) return result.minor
    ctx.addIssue({ code: 'custom', message: result.error })
    return z.NEVER
  }),
  pickupInstructions: z
    .string({ error: 'invalid' })
    .trim()
    .max(PICKUP_INSTRUCTIONS_MAX, 'tooLong'),
})

export type SettingsData = {
  zasilkovnaPriceMinor: number | null
  pickupInstructions: string
}

export type ParseSettingsFormResult =
  { ok: true; data: SettingsData } | { ok: false; errors: SettingsFormErrors }

export function parseSettingsForm(input: unknown): ParseSettingsFormResult {
  const result = settingsFormSchema.safeParse(input)
  if (result.success) {
    const { zasilkovnaPrice, pickupInstructions } = result.data
    return {
      ok: true,
      data: { zasilkovnaPriceMinor: zasilkovnaPrice, pickupInstructions },
    }
  }

  const errors: SettingsFormErrors = {}
  for (const issue of result.error.issues) {
    const field = (issue.path[0] as SettingsFormField | undefined) ?? 'form'
    const key = (SETTINGS_ERROR_KEYS as readonly string[]).includes(
      issue.message,
    )
      ? issue.message
      : 'invalid'
    errors[field] ??= key
  }
  return { ok: false, errors }
}
