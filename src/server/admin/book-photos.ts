import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import type { PhotoEntry } from '@/lib/book-form-schema'
import { db } from '@/server/db/client'
import { bookImages } from '@/server/db/schema'
import type { ObjectStorage } from '@/server/storage/object-storage'
import { removeImages } from '@/server/storage/remove-images'
import { RENDITIONS, finalKey, stagingKey } from '@/server/storage/rules'
import { verifyFinalPhoto, verifyUpload } from '@/server/storage/verify-upload'

export type StoredPhoto = {
  id: string // the image id, also the id of its row
  baseKey: string // books/<bookId>/<imageId>; the three sizes live under it
  width: number
  height: number
}

// The photo list a save will produce, in order. A new photo has not been copied
// into place yet.
export type PlannedPhoto =
  | { kind: 'existing'; photo: StoredPhoto }
  | { kind: 'new'; uploadId: string; photo: StoredPhoto }

type Executor = Pick<typeof db, 'select'>

export async function photosOf(
  executor: Executor,
  bookId: string,
): Promise<StoredPhoto[]> {
  return executor
    .select({
      id: bookImages.id,
      baseKey: bookImages.baseKey,
      width: bookImages.width,
      height: bookImages.height,
    })
    .from(bookImages)
    .where(eq(bookImages.bookId, bookId))
    .orderBy(asc(bookImages.position))
}

export type PreparePhotosResult =
  | { ok: true; plan: PlannedPhoto[] }
  | { ok: false; error: 'photoMissing' | 'photoInvalid' }

// Turns the form's photo list into a plan, after checking everything the
// browser sent. Nothing is trusted: an existing photo must really belong to this
// book, and a new one must be a complete, valid upload in the staging area.
export async function preparePhotos(input: {
  storage: ObjectStorage
  bookId: string
  entries: PhotoEntry[]
  current: StoredPhoto[]
}): Promise<PreparePhotosResult> {
  const { storage, bookId, entries, current } = input
  const currentById = new Map(current.map((photo) => [photo.id, photo]))
  const seen = new Set<string>()
  const plan: PlannedPhoto[] = []

  for (const entry of entries) {
    const identity = entry.kind === 'existing' ? entry.imageId : entry.uploadId
    // The same photo or ticket listed twice.
    if (seen.has(identity)) return { ok: false, error: 'photoInvalid' }
    seen.add(identity)

    if (entry.kind === 'existing') {
      const photo = currentById.get(entry.imageId)
      if (!photo) return { ok: false, error: 'photoInvalid' }
      plan.push({ kind: 'existing', photo })
      continue
    }

    const verified = await verifyUpload(storage, entry.uploadId)
    if (!verified.ok) {
      return {
        ok: false,
        error: verified.reason === 'missing' ? 'photoMissing' : 'photoInvalid',
      }
    }
    const imageId = randomUUID()
    plan.push({
      kind: 'new',
      uploadId: entry.uploadId,
      photo: {
        id: imageId,
        baseKey: `books/${bookId}/${imageId}`,
        width: verified.width,
        height: verified.height,
      },
    })
  }
  return { ok: true, plan }
}

export type CopyPhotosResult =
  { ok: true; plan: PlannedPhoto[] } | { ok: false; error: 'photoInvalid' }

// Copies the new photos from staging to their final place, then checks the
// copies. The staged files were checked before, but whoever holds the upload
// links can replace them until now; the copies cannot be touched by anyone else,
// so what is checked here is exactly what the shop will serve. The size stored
// for a photo is the size of the copied file.
//
// If a copy fails, the ones already made are removed and the error is thrown. If
// a copy fails the check, they are removed and the save is refused.
export async function copyNewPhotos(
  storage: ObjectStorage,
  plan: PlannedPhoto[],
): Promise<CopyPhotosResult> {
  const added = plan.filter((p) => p.kind === 'new')
  try {
    for (const planned of added) {
      for (const rendition of RENDITIONS) {
        await storage.copy(
          stagingKey(planned.uploadId, rendition),
          finalKey(planned.photo.baseKey, rendition),
        )
      }
    }
  } catch (error) {
    // The photo being copied when it failed may be partly there too.
    await removeImages(
      storage,
      added.map((p) => p.photo.baseKey),
    )
    throw error
  }

  const sizes = new Map<string, { width: number; height: number }>()
  for (const planned of added) {
    const checked = await verifyFinalPhoto(storage, planned.photo.baseKey)
    if (!checked.ok) {
      await removeImages(
        storage,
        added.map((p) => p.photo.baseKey),
      )
      return { ok: false, error: 'photoInvalid' }
    }
    sizes.set(planned.photo.id, {
      width: checked.width,
      height: checked.height,
    })
  }

  return {
    ok: true,
    plan: plan.map((planned) => {
      const size = sizes.get(planned.photo.id)
      return planned.kind === 'new' && size
        ? { ...planned, photo: { ...planned.photo, ...size } }
        : planned
    }),
  }
}

// Removes the copies of new photos after a save that did not go through.
export function discardNewPhotos(storage: ObjectStorage, plan: PlannedPhoto[]) {
  return removeImages(
    storage,
    plan.filter((p) => p.kind === 'new').map((p) => p.photo.baseKey),
  )
}

// After a save went through: the staging copies are no longer needed.
export async function clearStaging(
  storage: ObjectStorage,
  plan: PlannedPhoto[],
) {
  const keys = plan
    .filter((p) => p.kind === 'new')
    .flatMap((p) => RENDITIONS.map((r) => stagingKey(p.uploadId, r)))
  if (keys.length === 0) return
  try {
    await storage.deleteMany(keys)
  } catch (error) {
    // The lifecycle rule on uploads/ removes them within a day.
    console.warn(
      'Could not clear the staging files',
      error instanceof Error ? error.message : error,
    )
  }
}

export const sameOrder = (plan: PlannedPhoto[], current: StoredPhoto[]) =>
  plan.length === current.length &&
  plan.every((p, i) => p.kind === 'existing' && p.photo.id === current[i].id)
