import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { db } from '@/server/db/client'
import { orders } from '@/server/db/schema'
import { createOrder, resetDatabase } from '@/server/db/test-helpers'
import { setTrackingNumber } from './order-status'

const NO_ID = '00000000-0000-4000-8000-000000000000'
const paidAt = new Date('2026-10-18T10:00:00.000Z')

beforeEach(resetDatabase)

async function loadOrder(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id))
  return row
}

function zasilkovna(status: 'shipped' | 'completed' = 'shipped') {
  return createOrder({
    status,
    paidAt,
    shippingMethod: 'zasilkovna',
    trackingNumber: 'Z111',
  })
}

describe('setTrackingNumber', () => {
  it.each(['shipped', 'completed'] as const)(
    'corrects the number of a %s Zásilkovna order, trimmed',
    async (status) => {
      const actor = await testActor()
      const order = await zasilkovna(status)

      const result = await setTrackingNumber(actor, order.id, '  Z222 333 ')

      expect(result).toEqual({ outcome: 'saved' })
      const row = await loadOrder(order.id)
      expect(row.trackingNumber).toBe('Z222 333')
      expect(row.status).toBe(status)
    },
  )

  it('reports the same number as unchanged', async () => {
    const actor = await testActor()
    const order = await zasilkovna()

    expect(await setTrackingNumber(actor, order.id, ' Z111 ')).toEqual({
      outcome: 'unchanged',
    })
    expect((await loadOrder(order.id)).trackingNumber).toBe('Z111')
  })

  it.each(['pending_payment', 'paid', 'cancelled', 'refunded'] as const)(
    'refuses a %s order and writes nothing',
    async (status) => {
      const actor = await testActor()
      const order = await createOrder({
        status,
        paidAt: status === 'paid' || status === 'refunded' ? paidAt : null,
        shippingMethod: 'zasilkovna',
      })

      expect(await setTrackingNumber(actor, order.id, 'Z999')).toEqual({
        outcome: 'refused',
        reason: 'not_shipped',
      })
      expect((await loadOrder(order.id)).trackingNumber).toBeNull()
    },
  )

  it('refuses a pickup order, which is never shipped', async () => {
    const actor = await testActor()
    const order = await createOrder({
      status: 'completed',
      paidAt,
      shippingMethod: 'pickup',
    })

    expect(await setTrackingNumber(actor, order.id, 'Z999')).toEqual({
      outcome: 'refused',
      reason: 'not_shipped',
    })
    expect((await loadOrder(order.id)).trackingNumber).toBeNull()
  })

  it('refuses an unusable number and keeps the old one', async () => {
    const actor = await testActor()
    const order = await zasilkovna()

    for (const bad of ['', '   ', 'x'.repeat(101), 'Z1\nZ2']) {
      expect(await setTrackingNumber(actor, order.id, bad)).toEqual({
        outcome: 'refused',
        reason: 'invalid_tracking',
      })
    }
    expect((await loadOrder(order.id)).trackingNumber).toBe('Z111')
  })

  it('reports an unknown or malformed id as not found', async () => {
    const actor = await testActor()
    for (const id of [NO_ID, 'not-a-uuid']) {
      expect(await setTrackingNumber(actor, id, 'Z1')).toEqual({
        outcome: 'refused',
        reason: 'not_found',
      })
    }
  })
})
