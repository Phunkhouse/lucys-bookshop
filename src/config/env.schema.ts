import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.url(),
})

export function parseEnv(source: Record<string, string | undefined>) {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    )
  }

  return result.data
}
