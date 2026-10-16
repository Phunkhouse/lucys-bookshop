import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { listCatalog } from '@/server/catalog'
import { db } from '@/server/db/client'
import { bookImages, books } from '@/server/db/schema'
import { resetDatabase } from '@/server/db/test-helpers'
import { FakeObjectStorage } from '@/server/storage/fake-object-storage'
import { stageUpload } from '@/server/storage/test-helpers'
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

// Three sizes of the same 3:4 photo, scaled so each upload has its own width.
function stage(largeWidth = 1200) {
  const uploadId = randomUUID()
  const large = { width: largeWidth, height: (largeWidth * 4) / 3 }
  const medium = { width: largeWidth * 0.6, height: (largeWidth * 0.6 * 4) / 3 }
  const thumb = { width: largeWidth * 0.3, height: (largeWidth * 0.3 * 4) / 3 }
  stageUpload(storage, uploadId, { large, medium, thumb })
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

  it('makes the first photo the cover in the shop', async () => {
    const { id } = await createWithPhotos([1200, 600])

    const [cover] = await listCatalog(now)

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
