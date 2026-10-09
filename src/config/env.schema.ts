import { z } from 'zod'

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
})

const HOSTNAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i

const envSchema = databaseEnvSchema
  .extend({
    // Signs session cookies. Generate with: openssl rand -base64 32
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public address of the app. Leave unset on Vercel previews: each preview
    // has its own address, taken from VERCEL_URL (set by Vercel, no protocol).
    BETTER_AUTH_URL: z.url().optional(),
    VERCEL_URL: z.string().optional(),
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
