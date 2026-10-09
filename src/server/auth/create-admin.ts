import { z } from 'zod'
import type { createAuth } from './create-auth'
import { MIN_PASSWORD_LENGTH } from './create-auth'

const adminSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
})

// Sign-up is disabled, and that switch also blocks auth.api.signUpEmail, so
// accounts are created through the same internals the sign-up route uses.
export async function createAdmin(
  auth: ReturnType<typeof createAuth>,
  input: z.input<typeof adminSchema>,
) {
  const { name, email, password } = adminSchema.parse(input)
  const ctx = await auth.$context

  if ((await ctx.internalAdapter.findUserByEmail(email))?.user) {
    throw new Error('An account with this email already exists')
  }

  const hash = await ctx.password.hash(password)
  const user = await ctx.internalAdapter.createUser(
    { name, email, emailVerified: true },
    { method: 'email-password' },
  )
  try {
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
      password: hash,
    })
  } catch (error) {
    await ctx.internalAdapter.deleteUser(user.id)
    throw error
  }
  return { id: user.id, email: user.email }
}
