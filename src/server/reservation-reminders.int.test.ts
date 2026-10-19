import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { orders } from '@/server/db/schema'
import { createOrder, resetDatabase } from '@/server/db/test-helpers'
import { sendReservationReminders } from './reservation-reminders'
import { FakeNotifier } from './test-notifier'

const now = new Date('2026-10-18T12:00:00.000Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const context = { adminBaseUrl: 'https://shop.example', now }

beforeEach(resetDatabase)
afterEach(() => vi.restoreAllMocks())

type OrderInsert = Partial<typeof orders.$inferInsert>

// An unpaid order whose reservation ends in `hoursLeft` hours.
function due(hoursLeft: number, overrides: OrderInsert = {}) {
  return createOrder({ expiresAt: at(hoursLeft * HOUR), ...overrides })
}

async function remindedAt(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id))
  return row.sellerRemindedAt
}

describe('sendReservationReminders: which orders', () => {
  it('reminds unpaid orders ending within 24 hours, soonest first, in one mail', async () => {
    const notifier = new FakeNotifier()
    const late = await due(20)
    const soon = await due(3)
    const middle = await due(11)
    await due(30) // not yet

    const result = await sendReservationReminders(notifier, context)

    expect(result).toEqual({ sent: 3, failed: 0 })
    expect(notifier.reminders).toHaveLength(1)
    expect(notifier.reminders[0].map((o) => o.number)).toEqual([
      soon.number,
      middle.number,
      late.number,
    ])
    expect(notifier.reminders[0][0]).toMatchObject({
      name: 'Test Buyer',
      totalMinor: 10000,
      currency: 'CZK',
      expiresAt: soon.expiresAt,
      adminUrl: `https://shop.example/admin/orders/${soon.number}`,
    })
  })

  it('counts exactly 24 hours as due and 24 hours plus a millisecond as not yet', async () => {
    const notifier = new FakeNotifier()
    const exactly = await createOrder({ expiresAt: at(24 * HOUR) })
    const later = await createOrder({ expiresAt: at(24 * HOUR + 1) })

    await sendReservationReminders(notifier, context)

    expect(notifier.reminders[0].map((o) => o.number)).toEqual([exactly.number])
    expect(await remindedAt(later.id)).toBeNull()
  })

  // At exactly the deadline the books are still held (spec 6.4).
  it('still reminds at exactly the deadline, but not one millisecond after it', async () => {
    const notifier = new FakeNotifier()
    const atDeadline = await createOrder({ expiresAt: now })
    const expired = await createOrder({ expiresAt: at(-1) })

    await sendReservationReminders(notifier, context)

    expect(notifier.reminders[0].map((o) => o.number)).toEqual([
      atDeadline.number,
    ])
    expect(await remindedAt(expired.id)).toBeNull()
  })

  it('skips orders that are paid, cancelled or refunded', async () => {
    const notifier = new FakeNotifier()
    const unpaid = await due(5)
    await due(5, { status: 'paid', paidAt: at(-HOUR) })
    await due(5, { status: 'shipped', paidAt: at(-HOUR) })
    await due(5, { status: 'cancelled' })
    await due(5, { status: 'refunded', paidAt: at(-HOUR) })

    await sendReservationReminders(notifier, context)

    expect(notifier.reminders[0].map((o) => o.number)).toEqual([unpaid.number])
  })

  it('marks exactly the reminded orders', async () => {
    const notifier = new FakeNotifier()
    const reminded = await due(5)
    const notYet = await due(40)
    const before = at(-3 * HOUR)
    const already = await due(6, { sellerRemindedAt: before })

    await sendReservationReminders(notifier, context)

    expect(await remindedAt(reminded.id)).toEqual(now)
    expect(await remindedAt(notYet.id)).toBeNull()
    // One that was reminded before keeps its time and is not mentioned again.
    expect(await remindedAt(already.id)).toEqual(before)
    expect(notifier.reminders[0].map((o) => o.number)).toEqual([
      reminded.number,
    ])
  })

  it('does not call the notifier when nothing is due', async () => {
    const notifier = new FakeNotifier()
    await due(40)

    expect(await sendReservationReminders(notifier, context)).toEqual({
      sent: 0,
      failed: 0,
    })
    expect(notifier.reminders).toHaveLength(0)
  })
})

describe('sendReservationReminders: once per order', () => {
  it('sends nothing the second time', async () => {
    const notifier = new FakeNotifier()
    await due(5)
    await sendReservationReminders(notifier, context)

    const again = await sendReservationReminders(notifier, {
      ...context,
      now: at(HOUR),
    })

    expect(again).toEqual({ sent: 0, failed: 0 })
    expect(notifier.reminders).toHaveLength(1)
  })

  it('does not remind again when the seller extended the reservation', async () => {
    const notifier = new FakeNotifier()
    const order = await due(5, { paymentMethod: 'cash_on_pickup' })
    await sendReservationReminders(notifier, context)
    // Extended by 48 hours, and a day and a half later it ends soon again.
    await db
      .update(orders)
      .set({ expiresAt: at(53 * HOUR) })
      .where(eq(orders.id, order.id))

    await sendReservationReminders(notifier, {
      ...context,
      now: at(40 * HOUR),
    })

    expect(notifier.reminders).toHaveLength(1)
  })
})

describe('sendReservationReminders: when sending fails', () => {
  it('releases the orders, counts them as failed, and sends them next time', async () => {
    const notifier = new FakeNotifier()
    notifier.failReminders = true
    const a = await due(3)
    const b = await due(9)

    const failed = await sendReservationReminders(notifier, context)

    expect(failed).toEqual({ sent: 0, failed: 2 })
    expect(await remindedAt(a.id)).toBeNull()
    expect(await remindedAt(b.id)).toBeNull()

    notifier.failReminders = false
    const next = await sendReservationReminders(notifier, {
      ...context,
      now: at(HOUR),
    })
    expect(next).toEqual({ sent: 2, failed: 0 })
    expect(notifier.reminders[0].map((o) => o.number)).toEqual([
      a.number,
      b.number,
    ])
    expect(await remindedAt(a.id)).toEqual(at(HOUR))
  })
})

describe('sendReservationReminders: limits and overlap', () => {
  it('sends at most 20 per run, soonest first, and the rest next time', async () => {
    const notifier = new FakeNotifier()
    for (let i = 0; i < 25; i++) await due(1 + i * 0.5)

    const first = await sendReservationReminders(notifier, context)
    const second = await sendReservationReminders(notifier, {
      ...context,
      now: at(MINUTE),
    })

    expect(first).toEqual({ sent: 20, failed: 0 })
    expect(second).toEqual({ sent: 5, failed: 0 })
    const all = notifier.reminders.flat().map((o) => o.number)
    expect(new Set(all).size).toBe(25)
    // The first mail has the 20 that end soonest.
    const firstDeadlines = notifier.reminders[0].map((o) =>
      o.expiresAt.getTime(),
    )
    expect([...firstDeadlines].sort((x, y) => x - y)).toEqual(firstDeadlines)
    expect(Math.max(...firstDeadlines)).toBeLessThan(
      Math.min(...notifier.reminders[1].map((o) => o.expiresAt.getTime())),
    )
  })

  // Two runs at once (a slow run and the next hour's, or two callers) must not
  // mail the same order twice: the orders are claimed before anything is sent.
  it('mails each order once when two runs start together', async () => {
    const notifier = new FakeNotifier()
    for (let i = 0; i < 8; i++) await due(2 + i)

    const results = await Promise.all([
      sendReservationReminders(notifier, context),
      sendReservationReminders(notifier, context),
    ])

    const all = notifier.reminders.flat().map((o) => o.number)
    expect(all).toHaveLength(8)
    expect(new Set(all).size).toBe(8)
    expect(results[0].sent + results[1].sent).toBe(8)
  })
})
