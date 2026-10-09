import { z } from 'zod'

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
})

const envSchema = databaseEnvSchema.extend({
  // Signs session cookies. Generate with: openssl rand -base64 32
  BETTER_AUTH_SECRET: z.string().min(32),
  // Public address of the app, no trailing slash.
  BETTER_AUTH_URL: z.url(),
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
