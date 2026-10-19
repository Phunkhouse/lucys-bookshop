import { z } from 'zod'
import { cartInputSchema } from './cart-schema'

// The longest pickup point text the server accepts. The form's input uses it too, so
// the two cannot drift apart.
export const SHIPPING_DETAILS_MAX = 200

// Shared by the checkout form (browser) and placeOrder (server), spec 6.5.
// Prices and totals are deliberately not part of it: the server recalculates.
export const SHIPPING_METHODS = ['pickup', 'zasilkovna'] as const
export const PAYMENT_METHODS = ['bank_transfer', 'cash_on_pickup'] as const

const PHONE_CHARS = /^\+?[0-9 ()-]+$/

export const checkoutInputSchema = z
  .object({
    cart: cartInputSchema
      .min(1)
      .refine(
        (items) => new Set(items.map((i) => i.shortId)).size === items.length,
      ),
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().max(200).pipe(z.email()),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(PHONE_CHARS)
      .refine((value) => {
        const digits = value.replace(/\D/g, '').length
        return digits >= 9 && digits <= 15
      }),
    shippingMethod: z.enum(SHIPPING_METHODS),
    paymentMethod: z.enum(PAYMENT_METHODS),
    // The Zásilkovna pickup point, typed by the buyer. Ignored for pickup.
    shippingDetails: z.string().trim().max(SHIPPING_DETAILS_MAX).optional(),
    acceptTerms: z.literal(true),
    acceptPrivacy: z.literal(true),
    // Chosen by the browser per attempt, so a double click is one order.
    checkoutKey: z.uuid(),
    // The shipping price shown to the buyer. Only compared with the current
    // one, like the book prices: a mismatch sends the buyer back to look.
    shippingMinorSeen: z.number().int().nonnegative(),
    // Honeypot: hidden in the form, so only a bot fills it.
    website: z.string().max(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.shippingMethod === 'zasilkovna' && !value.shippingDetails) {
      ctx.addIssue({ code: 'custom', path: ['shippingDetails'] })
    }
    if (
      value.paymentMethod === 'cash_on_pickup' &&
      value.shippingMethod !== 'pickup'
    ) {
      ctx.addIssue({ code: 'custom', path: ['paymentMethod'] })
    }
  })

export type CheckoutInput = z.infer<typeof checkoutInputSchema>
