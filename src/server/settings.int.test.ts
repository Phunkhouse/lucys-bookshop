import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { settings } from '@/server/db/schema'
import { resetDatabase } from '@/server/db/test-helpers'
import { getShopSettings } from './settings'

beforeEach(resetDatabase)

describe('getShopSettings', () => {
  it('says "not set up" when there is no row', async () => {
    expect(await getShopSettings()).toEqual({
      zasilkovnaPriceMinor: null,
      pickupInstructions: '',
    })
  })

  it('reads what the seller saved', async () => {
    await db.insert(settings).values({
      zasilkovnaPriceMinor: 8900,
      pickupInstructions: 'Po–Pá po 17. hodině',
    })
    expect(await getShopSettings()).toEqual({
      zasilkovnaPriceMinor: 8900,
      pickupInstructions: 'Po–Pá po 17. hodině',
    })
  })
})
