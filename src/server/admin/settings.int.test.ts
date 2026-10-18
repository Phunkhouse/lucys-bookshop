import { beforeEach, describe, expect, it } from 'vitest'
import { createRequireAdmin } from '@/server/auth/require-admin'
import { UnauthorizedError } from '@/server/auth/errors'
import { testActor } from '@/server/auth/test-helpers'
import { db } from '@/server/db/client'
import { settings } from '@/server/db/schema'
import { resetDatabase } from '@/server/db/test-helpers'
import { getShopSettings } from '@/server/settings'
import { updateSettings } from './settings'

beforeEach(resetDatabase)

const input = { zasilkovnaPrice: '89', pickupInstructions: 'Na Příkopě 1' }

describe('updateSettings', () => {
  it('saves the price and the pickup text, and checkout reads them', async () => {
    const actor = await testActor()

    expect(await updateSettings(actor, input)).toEqual({ ok: true })

    expect(await getShopSettings()).toEqual({
      zasilkovnaPriceMinor: 8900,
      pickupInstructions: 'Na Příkopě 1',
    })
  })

  it('clears the price with an empty text, so Zásilkovna is not offered', async () => {
    const actor = await testActor()
    await updateSettings(actor, input)

    await updateSettings(actor, { ...input, zasilkovnaPrice: '' })

    expect(await getShopSettings()).toEqual({
      zasilkovnaPriceMinor: null,
      pickupInstructions: 'Na Příkopě 1',
    })
  })

  it.each(['-5', '0', '100001', 'abc'])(
    'rejects the price %j and leaves the saved settings alone',
    async (zasilkovnaPrice) => {
      const actor = await testActor()
      await updateSettings(actor, input)

      const result = await updateSettings(actor, { ...input, zasilkovnaPrice })

      expect(result).toMatchObject({ ok: false })
      expect(await getShopSettings()).toMatchObject({
        zasilkovnaPriceMinor: 8900,
      })
    },
  )

  it('rejects too long pickup text and writes nothing', async () => {
    const actor = await testActor()

    const result = await updateSettings(actor, {
      ...input,
      pickupInstructions: 'a'.repeat(501),
    })

    expect(result).toEqual({
      ok: false,
      errors: { pickupInstructions: 'tooLong' },
    })
    expect(await db.select().from(settings)).toHaveLength(0)
  })

  it('is idempotent and keeps exactly one row, id 1', async () => {
    const actor = await testActor()

    await updateSettings(actor, input)
    await updateSettings(actor, input)
    await Promise.all([
      updateSettings(actor, { ...input, zasilkovnaPrice: '99' }),
      updateSettings(actor, { ...input, zasilkovnaPrice: '109' }),
    ])

    const rows = await db.select().from(settings)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(1)
    expect([9900, 10900]).toContain(rows[0].zasilkovnaPriceMinor)
  })

  it('cannot be reached without an admin session', async () => {
    // The actor comes only from requireAdmin(); without a session none exists.
    const requireAdmin = createRequireAdmin(async () => null)

    await expect(requireAdmin(new Headers())).rejects.toBeInstanceOf(
      UnauthorizedError,
    )
    expect(await db.select().from(settings)).toHaveLength(0)
  })
})
