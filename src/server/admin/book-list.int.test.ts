import { beforeEach, describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { addImage, createBook, resetDatabase } from '@/server/db/test-helpers'
import { listAdminBooks } from './book-list'

const now = new Date('2026-10-09T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

beforeEach(resetDatabase)

async function seedEveryStatus() {
  return {
    available: await createBook({ status: 'available' }),
    expired: await createBook({
      status: 'reserved',
      reservedUntil: at(-HOUR),
    }),
    reserved: await createBook({
      status: 'reserved',
      reservedUntil: at(HOUR),
    }),
    // The shop stops showing it after 14 days, but the admin still lists it.
    soldLongAgo: await createBook({ status: 'sold', soldAt: at(-100 * DAY) }),
    hidden: await createBook({ status: 'hidden' }),
  }
}

describe('listAdminBooks', () => {
  it('lists every book, hidden and long-sold ones included, with the displayed status', async () => {
    const actor = await testActor()
    const seeded = await seedEveryStatus()

    const { items } = await listAdminBooks(actor, { status: 'all', now })

    const statusById = Object.fromEntries(items.map((b) => [b.id, b.status]))
    expect(statusById).toEqual({
      [seeded.available.id]: 'available',
      [seeded.expired.id]: 'available', // expired reservation counts as available
      [seeded.reserved.id]: 'reserved',
      [seeded.soldLongAgo.id]: 'sold',
      [seeded.hidden.id]: 'hidden',
    })
  })

  it('filters by the displayed status', async () => {
    const actor = await testActor()
    const seeded = await seedEveryStatus()
    const idsFor = async (
      status: 'available' | 'reserved' | 'sold' | 'hidden',
    ) =>
      (await listAdminBooks(actor, { status, now })).items
        .map((b) => b.id)
        .sort()

    expect(await idsFor('available')).toEqual(
      [seeded.available.id, seeded.expired.id].sort(),
    )
    expect(await idsFor('reserved')).toEqual([seeded.reserved.id])
    expect(await idsFor('sold')).toEqual([seeded.soldLongAgo.id])
    expect(await idsFor('hidden')).toEqual([seeded.hidden.id])
  })

  it('shows a reservation ending exactly now as reserved, and 1 ms later as available', async () => {
    const actor = await testActor()
    const atDeadline = await createBook({
      status: 'reserved',
      reservedUntil: at(0),
    })
    const justExpired = await createBook({
      status: 'reserved',
      reservedUntil: at(-1),
    })

    const reserved = await listAdminBooks(actor, { status: 'reserved', now })
    const available = await listAdminBooks(actor, { status: 'available', now })

    expect(reserved.items.map((b) => b.id)).toEqual([atDeadline.id])
    expect(available.items.map((b) => b.id)).toEqual([justExpired.id])
  })

  it('lists newest first, with a stable order for equal dates', async () => {
    const actor = await testActor()
    const sameMoment = at(-DAY)
    const older = await createBook({ createdAt: at(-5 * DAY) })
    const newest = await createBook({ createdAt: at(-HOUR) })
    const tieA = await createBook({ createdAt: sameMoment })
    const tieB = await createBook({ createdAt: sameMoment })

    const first = await listAdminBooks(actor, { status: 'all', now })
    const second = await listAdminBooks(actor, { status: 'all', now })

    const ids = first.items.map((b) => b.id)
    expect(ids[0]).toBe(newest.id)
    expect(ids[3]).toBe(older.id)
    expect(new Set(ids.slice(1, 3))).toEqual(new Set([tieA.id, tieB.id]))
    expect(second.items.map((b) => b.id)).toEqual(ids)
  })

  it('gives each row its last-changed date and photo count', async () => {
    const actor = await testActor()
    const changed = new Date('2026-09-01T08:00:00.000Z')
    const withPhotos = await createBook({ updatedAt: changed })
    await addImage(withPhotos.id, 0)
    await addImage(withPhotos.id, 1)
    const noPhotos = await createBook()

    const { items } = await listAdminBooks(actor, { status: 'all', now })

    const byId = Object.fromEntries(items.map((b) => [b.id, b]))
    expect(byId[withPhotos.id].photoCount).toBe(2)
    expect(byId[withPhotos.id].updatedAt).toEqual(changed)
    expect(byId[noPhotos.id].photoCount).toBe(0)
  })

  it('counts books per displayed status, whatever filter is selected', async () => {
    const actor = await testActor()
    await seedEveryStatus()

    const { counts } = await listAdminBooks(actor, { status: 'hidden', now })

    expect(counts).toEqual({
      all: 5,
      available: 2,
      reserved: 1,
      sold: 1,
      hidden: 1,
    })
  })

  it('returns nothing and zero counts for an empty shop', async () => {
    const actor = await testActor()

    expect(await listAdminBooks(actor, { status: 'all', now })).toEqual({
      items: [],
      counts: { all: 0, available: 0, reserved: 0, sold: 0, hidden: 0 },
    })
  })
})
