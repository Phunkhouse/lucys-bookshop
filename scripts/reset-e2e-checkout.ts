import 'dotenv/config' // must stay first: loads .env before anything reads the env
import { eq, inArray } from 'drizzle-orm'
import {
  E2E_BUYER_EMAIL,
  E2E_PICKUP_INSTRUCTIONS,
  E2E_ZASILKOVNA_PRICE_MINOR,
} from '../e2e/checkout-fixtures'
import { env } from '../src/config/env'
import { db, pool } from '../src/server/db/client'
import {
  books,
  orderItems,
  orders,
  requestLimits,
  settings,
} from '../src/server/db/schema'

// Used by the e2e global setup only, before the seed. Puts the checkout back in
// the state the tests expect: the e2e buyer's orders from earlier runs are gone
// (the seed then makes their books available again), the rate limit is empty so
// repeated runs do not lock each other out, and the shop settings are known.
// Refuses anything but a local database.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

async function main() {
  const { hostname } = new URL(env.DATABASE_URL)
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(
      `Refusing to reset checkout data on ${hostname}: only a local database is allowed.`,
    )
  }

  await db.transaction(async (tx) => {
    const old = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.email, E2E_BUYER_EMAIL))
    const ids = old.map((order) => order.id)
    if (ids.length > 0) {
      await tx
        .update(books)
        .set({ reservedByOrderId: null })
        .where(inArray(books.reservedByOrderId, ids))
      await tx.delete(orderItems).where(inArray(orderItems.orderId, ids))
      await tx.delete(orders).where(inArray(orders.id, ids))
    }

    await tx.delete(requestLimits)
    await tx
      .insert(settings)
      .values({
        zasilkovnaPriceMinor: E2E_ZASILKOVNA_PRICE_MINOR,
        pickupInstructions: E2E_PICKUP_INSTRUCTIONS,
      })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          zasilkovnaPriceMinor: E2E_ZASILKOVNA_PRICE_MINOR,
          pickupInstructions: E2E_PICKUP_INSTRUCTIONS,
          updatedAt: new Date(),
        },
      })
    console.log(`Reset checkout data (removed ${ids.length} e2e orders)`)
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
