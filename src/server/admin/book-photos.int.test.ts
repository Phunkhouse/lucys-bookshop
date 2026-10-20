import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { computeSizes } from '@/lib/photo-sizes'
import { listCatalog } from '@/server/catalog'
import { defaultCatalogQuery } from '@/server/catalog-query'
import { db } from '@/server/db/client'
import { bookImages, books } from '@/server/db/schema'
import { resetDatabase } from '@/server/db/test-helpers'
import { FakeObjectStorage } from '@/server/storage/fake-object-storage'
import { MAX_FILE_BYTES } from '@/server/storage/rules'
import { stageUpload, stagingKey } from '@/server/storage/test-helpers'
import { makeJpeg, makePng } from '@/server/storage/test-jpeg'
import { createListing, getListingForEdit, updateListing } from './book-listing'

const now = new Date('2026-10-16T12:00:00.000Z')
const longAgo = new Date('2026-01-01T00:00:00.000Z')

const form = {
  title: 'Stíny nad Vltavou',
  author: 'Marta Hrubešová',
  genres: [] as string[],
  language: 'cs',
  condition: 'used',
  conditionNote: '',
  description: '',
  price: '189',
  isbn: '',
}

let storage: FakeObjectStorage
beforeEach(async () => {
  await resetDatabase()
  storage = new FakeObjectStorage()
})

// The three sizes a browser makes of a 3:4 photo that is `largeWidth` wide: the
// same calculation, so the test photos are ones that can really exist.
function stage(largeWidth = 1200) {
  const uploadId = randomUUID()
  const computed = computeSizes(largeWidth, (largeWidth * 4) / 3)
  if (!computed.ok) throw new Error('expected sizes')
  stageUpload(storage, uploadId, computed.sizes)
  return uploadId
}

const newPhoto = (uploadId: string) => ({ kind: 'new' as const, uploadId })
const oldPhoto = (imageId: string) => ({ kind: 'existing' as const, imageId })

async function rowsOf(bookId: string) {
  return db
    .select()
    .from(bookImages)
    .where(eq(bookImages.bookId, bookId))
    .orderBy(asc(bookImages.position))
}

const finalKeys = () => storage.keys().filter((key) => key.startsWith('books/'))
const stagingKeys = () =>
  storage.keys().filter((key) => key.startsWith('uploads/'))

async function createWithPhotos(widths: number[]) {
  const actor = await testActor()
  const result = await createListing(
    actor,
    { ...form, photos: widths.map((w) => newPhoto(stage(w))) },
    { storage },
  )
  if (!result.ok) throw new Error('expected the listing to be created')
  const edit = await getListingForEdit(actor, result.id)
  if (!edit) throw new Error('expected the listing to load')
  return { actor, id: result.id, photos: edit.photos }
}

describe('creating a book with photos', () => {
  it('saves them in the order given, with the size of the large one, and moves the files into place', async () => {
    const actor = await testActor()
    const first = stage(1200)
    const second = stage(600)
    const third = stage(300)

    const result = await createListing(
      actor,
      { ...form, photos: [newPhoto(first), newPhoto(second), newPhoto(third)] },
      { storage },
    )

    if (!result.ok) throw new Error('expected the listing to be created')
    const rows = await rowsOf(result.id)
    expect(rows.map((r) => [r.position, r.width, r.height])).toEqual([
      [0, 1200, 1600],
      [1, 600, 800],
      [2, 300, 400],
    ])
    for (const row of rows) {
      expect(row.baseKey.startsWith(`books/${result.id}/`)).toBe(true)
    }
    // Nine files in their final place, and the staging copies are gone.
    expect(finalKeys().sort()).toEqual(
      rows
        .flatMap((r) =>
          ['large', 'medium', 'thumb'].map((n) => `${r.baseKey}/${n}.jpg`),
        )
        .sort(),
    )
    expect(stagingKeys()).toEqual([])
  })

  it('puts every saved file in place with Cache-Control for a year, "immutable"', async () => {
    const { photos } = await createWithPhotos([1200, 600])

    for (const photo of photos) {
      for (const name of ['thumb', 'medium', 'large']) {
        expect(
          (await storage.head(`${photo.baseKey}/${name}.jpg`))?.cacheControl,
        ).toBe('public, max-age=31536000, immutable')
      }
    }
  })

  it('makes the first photo the cover in the shop', async () => {
    const { id } = await createWithPhotos([1200, 600])

    const [cover] = (await listCatalog(defaultCatalogQuery, now)).items

    expect(cover.cover?.baseKey).toBe((await rowsOf(id))[0].baseKey)
  })

  it('saves a book with no photos, whether the list is empty or left out, and touches no files', async () => {
    const actor = await testActor()
    stage() // an upload that is never used

    const withEmpty = await createListing(
      actor,
      { ...form, photos: [] },
      { storage },
    )
    const without = await createListing(actor, form, { storage })

    for (const result of [withEmpty, without]) {
      if (!result.ok) throw new Error('expected the listing to be created')
      expect(await rowsOf(result.id)).toHaveLength(0)
    }
    expect(storage.keys()).toHaveLength(3)
  })

  it('refuses a sixth photo and saves nothing', async () => {
    const actor = await testActor()
    const uploads = Array.from({ length: 6 }, () => stage())

    const result = await createListing(
      actor,
      { ...form, photos: uploads.map(newPhoto) },
      { storage },
    )

    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      errors: { photos: 'tooManyPhotos' },
    })
    expect(await db.select().from(books)).toHaveLength(0)
    expect(stagingKeys()).toHaveLength(18)
  })

  it('refuses the whole save when one photo fails the checks, and leaves nothing half done', async () => {
    const actor = await testActor()
    const good = stage()
    const bad = randomUUID()
    stageUpload(storage, bad, { medium: { contentType: 'image/png' } })

    const result = await createListing(
      actor,
      { ...form, photos: [newPhoto(good), newPhoto(bad)] },
      { storage },
    )

    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      errors: { photos: 'photoInvalid' },
    })
    expect(await db.select().from(books)).toHaveLength(0)
    expect(await db.select().from(bookImages)).toHaveLength(0)
    expect(finalKeys()).toEqual([])
  })

  it('refuses a ticket that was never used, the same ticket twice, and a ticket already saved', async () => {
    const actor = await testActor()

    const unknown = await createListing(
      actor,
      { ...form, photos: [newPhoto(randomUUID())] },
      { storage },
    )
    const ticket = stage()
    const twice = await createListing(
      actor,
      { ...form, photos: [newPhoto(ticket), newPhoto(ticket)] },
      { storage },
    )
    const saved = await createListing(
      actor,
      { ...form, photos: [newPhoto(ticket)] },
      { storage },
    )
    const again = await createListing(
      actor,
      { ...form, photos: [newPhoto(ticket)] },
      { storage },
    )

    expect(unknown).toMatchObject({
      ok: false,
      errors: { photos: 'photoMissing' },
    })
    expect(twice).toMatchObject({
      ok: false,
      errors: { photos: 'photoInvalid' },
    })
    expect(saved.ok).toBe(true)
    expect(again).toMatchObject({
      ok: false,
      errors: { photos: 'photoMissing' },
    })
  })

  it('refuses a photo id of an existing photo, because a new book has none', async () => {
    const actor = await testActor()
    const other = await createWithPhotos([1200])

    const result = await createListing(
      actor,
      { ...form, photos: [oldPhoto(other.photos[0].imageId)] },
      { storage },
    )

    expect(result).toMatchObject({
      ok: false,
      errors: { photos: 'photoInvalid' },
    })
    expect(await db.select().from(books)).toHaveLength(1) // only the other book
    expect(await rowsOf(other.id)).toHaveLength(1)
  })

  it('when the storage fails part way, saves nothing and cleans up the files already copied', async () => {
    const actor = await testActor()
    const photos = [newPhoto(stage()), newPhoto(stage())]
    storage.failCopyAfter(4) // the fifth of six copies fails

    await expect(
      createListing(actor, { ...form, photos }, { storage }),
    ).rejects.toThrow()

    expect(await db.select().from(books)).toHaveLength(0)
    expect(await db.select().from(bookImages)).toHaveLength(0)
    expect(finalKeys()).toEqual([])
  })
})

describe('editing photos', () => {
  it('reorders them without touching any file, and counts it as a change', async () => {
    const { actor, id, photos } = await createWithPhotos([1200, 600, 300])
    await db.update(books).set({ updatedAt: longAgo }).where(eq(books.id, id))
    const [a, b, c] = photos.map((p) => p.imageId)
    const filesBefore = storage.keys()

    const result = await updateListing(
      actor,
      id,
      { ...form, photos: [oldPhoto(c), oldPhoto(a), oldPhoto(b)] },
      { storage },
    )

    expect(result).toEqual({ ok: true, outcome: 'changed' })
    expect(
      (await getListingForEdit(actor, id))!.photos.map((p) => p.imageId),
    ).toEqual([c, a, b])
    expect(storage.keys()).toEqual(filesBefore)
    const [row] = await db.select().from(books).where(eq(books.id, id))
    expect(row.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime())
  })

  it('removes one, closes the gap, and deletes its three files', async () => {
    const { actor, id, photos } = await createWithPhotos([1200, 600, 300])
    const [a, b, c] = photos

    const result = await updateListing(
      actor,
      id,
      { ...form, photos: [oldPhoto(a.imageId), oldPhoto(c.imageId)] },
      { storage },
    )

    expect(result).toEqual({ ok: true, outcome: 'changed' })
    const rows = await rowsOf(id)
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      [a.imageId, 0],
      [c.imageId, 1],
    ])
    expect(storage.keys().some((key) => key.startsWith(`${b.baseKey}/`))).toBe(
      false,
    )
    expect(finalKeys()).toHaveLength(6)
  })

  it('adds new photos next to the existing ones, up to five, and refuses a sixth', async () => {
    const { actor, id, photos } = await createWithPhotos([1200, 600, 300])
    const keep = photos.map((p) => oldPhoto(p.imageId))

    const five = await updateListing(
      actor,
      id,
      { ...form, photos: [...keep, newPhoto(stage()), newPhoto(stage())] },
      { storage },
    )
    expect(five).toEqual({ ok: true, outcome: 'changed' })
    expect(await rowsOf(id)).toHaveLength(5)

    const edit = await getListingForEdit(actor, id)
    const sixthUpload = stage()
    const six = await updateListing(
      actor,
      id,
      {
        ...form,
        photos: [
          ...edit!.photos.map((p) => oldPhoto(p.imageId)),
          newPhoto(sixthUpload),
        ],
      },
      { storage },
    )
    expect(six).toMatchObject({
      ok: false,
      errors: { photos: 'tooManyPhotos' },
    })
    expect(await rowsOf(id)).toHaveLength(5)
    expect(stagingKeys()).toHaveLength(3) // the sixth upload was not used
  })

  it('replaces a photo in one save: the old files go, the new ones arrive', async () => {
    const { actor, id, photos } = await createWithPhotos([1200, 600, 300])
    const [a, b, c] = photos
    const replacement = stage(900)

    const result = await updateListing(
      actor,
      id,
      {
        ...form,
        photos: [
          oldPhoto(a.imageId),
          oldPhoto(c.imageId),
          newPhoto(replacement),
        ],
      },
      { storage },
    )

    expect(result).toEqual({ ok: true, outcome: 'changed' })
    const rows = await rowsOf(id)
    expect(rows).toHaveLength(3)
    expect(rows[2].width).toBe(900)
    expect(storage.keys().some((key) => key.startsWith(`${b.baseKey}/`))).toBe(
      false,
    )
    expect(stagingKeys()).toEqual([])
    expect(finalKeys()).toHaveLength(9)
  })

  // Browsers may keep a photo for a year because an address never gets other
  // content: a changed photo is a new file at a new address.
  it('never reuses an address: a replacement lives elsewhere and the old files are gone', async () => {
    const { actor, id, photos } = await createWithPhotos([1200])
    const oldKey = photos[0].baseKey

    await updateListing(
      actor,
      id,
      { ...form, photos: [newPhoto(stage(900))] },
      { storage },
    )

    const [row] = await rowsOf(id)
    expect(row.baseKey).not.toBe(oldKey)
    expect(row.baseKey.startsWith(`books/${id}/`)).toBe(true)
    expect(storage.keys().some((key) => key.startsWith(`${oldKey}/`))).toBe(
      false,
    )
  })

  it('refuses a photo that belongs to another book, or does not exist, and changes nothing', async () => {
    const { actor, id, photos } = await createWithPhotos([1200, 600])
    const other = await createWithPhotos([300])
    const before = await rowsOf(id)

    for (const stranger of [other.photos[0].imageId, randomUUID()]) {
      const result = await updateListing(
        actor,
        id,
        { ...form, photos: [oldPhoto(photos[0].imageId), oldPhoto(stranger)] },
        { storage },
      )
      expect(result).toMatchObject({
        ok: false,
        errors: { photos: 'photoInvalid' },
      })
    }
    expect(await rowsOf(id)).toEqual(before)
    expect(await rowsOf(other.id)).toHaveLength(1)
  })

  it('leaves the photos alone when the form sends none, and removes them all for an empty list', async () => {
    const { actor, id } = await createWithPhotos([1200, 600])

    await updateListing(actor, id, { ...form, title: 'New title' }, { storage })
    expect(await rowsOf(id)).toHaveLength(2)
    expect(finalKeys()).toHaveLength(6)

    await updateListing(
      actor,
      id,
      { ...form, title: 'New title', photos: [] },
      { storage },
    )
    expect(await rowsOf(id)).toHaveLength(0)
    expect(finalKeys()).toEqual([])
  })

  it('says unchanged, and keeps updatedAt, when nothing differs, photos included', async () => {
    const { actor, id } = await createWithPhotos([1200, 600])
    await db.update(books).set({ updatedAt: longAgo }).where(eq(books.id, id))
    const edit = (await getListingForEdit(actor, id))!

    const result = await updateListing(
      actor,
      id,
      { ...edit.values, photos: edit.photos.map((p) => oldPhoto(p.imageId)) },
      { storage },
    )

    expect(result).toEqual({ ok: true, outcome: 'unchanged' })
    const [row] = await db.select().from(books).where(eq(books.id, id))
    expect(row.updatedAt).toEqual(longAgo)
  })

  it('still saves when deleting the old files fails afterwards (leftover files are harmless)', async () => {
    const { actor, id, photos } = await createWithPhotos([1200, 600])
    storage.failDeletes()

    const result = await updateListing(
      actor,
      id,
      { ...form, photos: [oldPhoto(photos[0].imageId)] },
      { storage },
    )

    expect(result).toEqual({ ok: true, outcome: 'changed' })
    expect(await rowsOf(id)).toHaveLength(1)
  })
})

describe('getListingForEdit photos', () => {
  it('lists the photos in order with what the form needs to show them', async () => {
    const { actor, id } = await createWithPhotos([1200, 600])

    const edit = (await getListingForEdit(actor, id))!

    expect(edit.photos).toHaveLength(2)
    const rows = await rowsOf(id)
    expect(edit.photos).toEqual(
      rows.map((r) => ({
        imageId: r.id,
        baseKey: r.baseKey,
        width: r.width,
        height: r.height,
      })),
    )
  })

  it('gives an empty list for a book without photos', async () => {
    const actor = await testActor()
    const created = await createListing(actor, form, { storage })
    if (!created.ok) throw new Error('expected the listing to be created')

    expect((await getListingForEdit(actor, created.id))!.photos).toEqual([])
  })
})

// The server checks the staged files, then copies them. Until the copy, whoever
// holds the upload links can still replace a staged file, so the files that were
// copied are checked again: they are what the shop will serve, and nobody else
// can write there.
describe('a staged file that changes after it was checked', () => {
  const swapLarge = (uploadId: string, bytes: Uint8Array) =>
    storage.beforeNextCopy(() =>
      storage.put(stagingKey(uploadId, 'large'), bytes, 'image/jpeg'),
    )

  it.each([
    ['a PNG', makePng()],
    [
      'a file over 2 MB',
      makeJpeg(1200, 1600, { totalBytes: MAX_FILE_BYTES + 1 }),
    ],
    ['a cut-off JPEG', makeJpeg(1200, 1600, { truncated: true })],
  ])(
    'refuses the save when it is swapped for %s, and keeps it out of books/',
    async (_name, bytes) => {
      const actor = await testActor()
      const ticket = stage()
      swapLarge(ticket, bytes)

      const result = await createListing(
        actor,
        { ...form, photos: [newPhoto(ticket)] },
        { storage },
      )

      expect(result).toEqual({
        ok: false,
        reason: 'invalid',
        errors: { photos: 'photoInvalid' },
      })
      expect(await db.select().from(books)).toHaveLength(0)
      expect(await db.select().from(bookImages)).toHaveLength(0)
      expect(finalKeys()).toEqual([])
    },
  )

  it('refuses an edit the same way, and leaves the book and its photos as they were', async () => {
    const { actor, id, photos } = await createWithPhotos([1200])
    const keysBefore = finalKeys()
    const ticket = stage()
    swapLarge(ticket, makePng())

    const result = await updateListing(
      actor,
      id,
      { ...form, photos: [oldPhoto(photos[0].imageId), newPhoto(ticket)] },
      { storage },
    )

    expect(result).toMatchObject({
      ok: false,
      errors: { photos: 'photoInvalid' },
    })
    expect((await rowsOf(id)).map((r) => r.id)).toEqual([photos[0].imageId])
    expect(finalKeys()).toEqual(keysBefore)
  })

  it('stores the size of the file that was really copied, when it is swapped for another valid photo', async () => {
    const actor = await testActor()
    const ticket = stage(1200) // checked as 1200 x 1600
    swapLarge(ticket, makeJpeg(960, 1280))

    const result = await createListing(
      actor,
      { ...form, photos: [newPhoto(ticket)] },
      { storage },
    )

    if (!result.ok) throw new Error('expected the listing to be created')
    const [row] = await rowsOf(result.id)
    expect([row.width, row.height]).toEqual([960, 1280])
  })
})

// A storage hiccup while the copies are being checked must not leave them
// behind: nothing points at them, and the expiry rule only covers uploads/.
describe('the storage fails while the copied photos are being checked', () => {
  it('on create, throws and leaves nothing under books/ and no rows', async () => {
    const actor = await testActor()
    const ticket = stage()
    // The staged files are checked before the copy; reads fail from the copy on.
    storage.beforeNextCopy(() => storage.failReads())

    await expect(
      createListing(
        actor,
        { ...form, photos: [newPhoto(ticket)] },
        { storage },
      ),
    ).rejects.toThrow()

    expect(await db.select().from(books)).toHaveLength(0)
    expect(await db.select().from(bookImages)).toHaveLength(0)
    expect(finalKeys()).toEqual([])
  })

  it('on edit, throws and leaves the book and its photos as they were', async () => {
    const { actor, id, photos } = await createWithPhotos([1200])
    const keysBefore = finalKeys()
    const ticket = stage()
    storage.beforeNextCopy(() => storage.failReads())

    await expect(
      updateListing(
        actor,
        id,
        { ...form, photos: [oldPhoto(photos[0].imageId), newPhoto(ticket)] },
        { storage },
      ),
    ).rejects.toThrow()

    expect((await rowsOf(id)).map((r) => r.id)).toEqual([photos[0].imageId])
    expect(finalKeys()).toEqual(keysBefore)
  })
})

describe('the same ticket saved twice at the same moment', () => {
  it('ends with one new photo and no stray files, whichever save wins', async () => {
    const { actor, id, photos } = await createWithPhotos([1200])
    const ticket = stage()
    const input = {
      ...form,
      photos: [oldPhoto(photos[0].imageId), newPhoto(ticket)],
    }

    const outcomes = await Promise.allSettled([
      updateListing(actor, id, input, { storage }),
      updateListing(actor, id, input, { storage }),
    ])

    // At least one save goes through; the other may too, or fail on the missing
    // staging files. Either way the book ends up consistent.
    expect(outcomes.some((o) => o.status === 'fulfilled' && o.value.ok)).toBe(
      true,
    )
    const rows = await rowsOf(id)
    expect(rows).toHaveLength(2)
    expect(finalKeys().sort()).toEqual(
      rows
        .flatMap((r) =>
          ['large', 'medium', 'thumb'].map((n) => `${r.baseKey}/${n}.jpg`),
        )
        .sort(),
    )
  })
})
