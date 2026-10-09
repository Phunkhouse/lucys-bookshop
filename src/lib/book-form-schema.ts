import { z } from 'zod'
import { normalizeIsbn } from './isbn'
import { parsePriceToMinor } from './price'

// One definition of a valid book form, used by the browser for instant
// feedback and by the server, which always checks again. Problems are plain
// keys; the Czech text lives in messages/cs.json under Admin.form.errors.

export const SUPPORTED_LANGUAGES = [
  'cs',
  'sk',
  'en',
  'de',
  'pl',
  'fr',
  'es',
  'it',
  'ru',
] as const

export const CONDITIONS = ['like_new', 'used'] as const

const LIMITS = {
  title: 200,
  author: 200,
  conditionNote: 300,
  description: 5000,
}

// What the form holds: text as typed, genres as keys.
export type BookFormValues = {
  title: string
  author: string
  genres: string[]
  language: string
  condition: string
  conditionNote: string
  description: string
  price: string
  isbn: string
}

// Every error is one of these keys.
export const BOOK_FORM_ERROR_KEYS = [
  'required',
  'tooLong',
  'invalid',
  'invalidLanguage',
  'invalidCondition',
  'unknownGenre',
  'priceInvalid',
  'priceDecimals',
  'pricePositive',
  'priceTooHigh',
  'isbnInvalid',
  'notFound',
  'saveFailed',
] as const

export type BookFormField = keyof BookFormValues
// "form" is for problems that belong to no single field.
export type BookFormErrors = Partial<Record<BookFormField | 'form', string>>
export type BookFormResult =
  { ok: true } | { ok: false; errors: BookFormErrors }

const required = {
  error: (issue: { input?: unknown }) =>
    issue.input === undefined ? 'required' : 'invalid',
}

const bookFormSchema = z.object({
  title: z
    .string(required)
    .trim()
    .min(1, 'required')
    .max(LIMITS.title, 'tooLong'),
  author: z
    .string(required)
    .trim()
    .min(1, 'required')
    .max(LIMITS.author, 'tooLong'),
  genres: z
    .array(z.string({ error: 'invalid' }), { error: 'invalid' })
    .optional()
    .transform((keys) => [...new Set(keys ?? [])]),
  language: z.enum(SUPPORTED_LANGUAGES, { error: 'invalidLanguage' }),
  condition: z.enum(CONDITIONS, { error: 'invalidCondition' }),
  conditionNote: z
    .string({ error: 'invalid' })
    .trim()
    .max(LIMITS.conditionNote, 'tooLong')
    .optional()
    .transform((note) => note || null),
  description: z
    .string({ error: 'invalid' })
    .trim()
    .max(LIMITS.description, 'tooLong')
    .optional()
    .transform((text) => text ?? ''),
  price: z.string(required).transform((text, ctx) => {
    const result = parsePriceToMinor(text)
    if (result.ok) return result.minor
    ctx.addIssue({ code: 'custom', message: result.error })
    return z.NEVER
  }),
  isbn: z
    .string({ error: 'invalid' })
    .optional()
    .transform((text, ctx) => {
      const result = normalizeIsbn(text ?? '')
      if (result.ok) return result.value
      ctx.addIssue({ code: 'custom', message: result.error })
      return z.NEVER
    }),
})

// Only these fields come out: anything else in the input (status, shortId,
// soldAt…) is dropped, so a hand-made request cannot set it.
export type BookData = Omit<z.output<typeof bookFormSchema>, 'price'> & {
  priceMinor: number
}

export type ParseBookFormResult =
  { ok: true; data: BookData } | { ok: false; errors: BookFormErrors }

export function parseBookForm(input: unknown): ParseBookFormResult {
  const result = bookFormSchema.safeParse(input)
  if (result.success) {
    const { price, ...rest } = result.data
    return { ok: true, data: { ...rest, priceMinor: price } }
  }

  const errors: BookFormErrors = {}
  for (const issue of result.error.issues) {
    const field = (issue.path[0] as BookFormField | undefined) ?? 'form'
    // Anything that is not one of our keys (Zod's own sentences, for input of
    // the wrong shape) becomes the generic "invalid".
    const key = (BOOK_FORM_ERROR_KEYS as readonly string[]).includes(
      issue.message,
    )
      ? issue.message
      : 'invalid'
    errors[field] ??= key
  }
  return { ok: false, errors }
}
