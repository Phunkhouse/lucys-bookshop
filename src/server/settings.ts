import { db } from './db/client'
import { settings } from './db/schema'

export type ShopSettings = {
  // Null until the seller sets it: Zásilkovna is then not offered.
  zasilkovnaPriceMinor: number | null
  pickupInstructions: string
}

// The seller's settings (spec 6.9). A shop with no saved row is a shop that is
// not set up yet, not an error.
export async function getShopSettings(): Promise<ShopSettings> {
  const [row] = await db.select().from(settings)
  return {
    zasilkovnaPriceMinor: row?.zasilkovnaPriceMinor ?? null,
    pickupInstructions: row?.pickupInstructions ?? '',
  }
}
