import { z } from 'zod'
import { isValidIban, normalizeIban } from '@/server/spayd'

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
})

const HOSTNAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i

// Where photos are read from: a public address (r2.dev today, a custom domain
// later) or a path on the app itself (/images) if the app serves them.
// A trailing slash is removed. Anything else is refused.
const imageBaseUrl = z.string().transform((value, ctx) => {
  const trimmed = value.replace(/\/+$/, '')
  const isAppPath = trimmed.startsWith('/') && !trimmed.startsWith('//')
  let isPublicUrl = false
  try {
    isPublicUrl = ['http:', 'https:'].includes(new URL(trimmed).protocol)
  } catch {}
  if (trimmed === '' || !(isAppPath || isPublicUrl)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Must be an http(s) address or a path starting with /',
    })
    return z.NEVER
  }
  return trimmed
})

const envSchema = databaseEnvSchema
  .extend({
    // Signs session cookies. Generate with: openssl rand -base64 32
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public address of the app. Leave unset on Vercel previews: each preview
    // has its own address, taken from VERCEL_URL (set by Vercel, no protocol).
    BETTER_AUTH_URL: z.url().optional(),
    VERCEL_URL: z.string().optional(),
    // Object storage for photos: Cloudflare R2 in production, MinIO locally.
    STORAGE_ENDPOINT: z.url(),
    STORAGE_BUCKET: z.string().min(1),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    STORAGE_REGION: z.string().min(1).default('auto'),
    // MinIO needs path-style addresses; R2 works either way.
    STORAGE_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    IMAGE_BASE_URL: imageBaseUrl,
    // The seller's account for QR payments (spec 6.6). Never committed: set per
    // environment. Optional so the shop still starts without it; a bank order
    // then shows no payment details. It must be set before launch.
    SELLER_IBAN: z
      .string()
      .optional()
      .transform((value) => (value ? normalizeIban(value) : undefined))
      .refine((value) => value === undefined || isValidIban(value), {
        message: 'Must be a valid Czech IBAN (CZ and 22 digits)',
      }),
  })
  .transform(({ BETTER_AUTH_URL, VERCEL_URL, ...rest }, ctx) => {
    const fromVercel =
      VERCEL_URL && HOSTNAME.test(VERCEL_URL)
        ? `https://${VERCEL_URL}`
        : undefined
    const url = (BETTER_AUTH_URL ?? fromVercel)?.replace(/\/+$/, '')
    if (!url) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: 'Required (VERCEL_URL is not set either)',
      })
      return z.NEVER
    }
    return { ...rest, BETTER_AUTH_URL: url }
  })

export function parseEnv(source: Record<string, string | undefined>) {
  return parseWith(envSchema, source)
}

// Only the database settings, for code that must not need the rest (the
// database client, db scripts, integration tests).
export function parseDatabaseEnv(source: Record<string, string | undefined>) {
  return parseWith(databaseEnvSchema, source)
}

function parseWith<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
): z.output<T> {
  const result = schema.safeParse(source)

  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    )
  }

  return result.data
}
