import { z } from 'zod'

// Shared by the browser (what it may store) and the server (what it accepts).
// What the browser sends: which books are in the cart and the price the buyer
// saw when adding each. The seen price is only compared, never trusted.
export const MAX_CART_ITEMS = 50

export const cartInputSchema = z
  .array(
    z.object({
      shortId: z.string().regex(/^[0-9a-z]{6,8}$/),
      priceMinorSeen: z.number().int().nonnegative(),
    }),
  )
  .max(MAX_CART_ITEMS)

export type CartInput = z.infer<typeof cartInputSchema>
