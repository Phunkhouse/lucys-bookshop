import type { ObjectStorage } from './object-storage'
import { RENDITIONS, finalKey } from './rules'

// Deletes all three sizes of each photo. Files without a book are harmless, so
// a failure here is reported, not thrown: it must not undo what the seller did.
export async function removeImages(
  storage: ObjectStorage,
  baseKeys: string[],
): Promise<{ failed: number }> {
  const keys = baseKeys.flatMap((base) =>
    RENDITIONS.map((rendition) => finalKey(base, rendition)),
  )
  if (keys.length === 0) return { failed: 0 }

  try {
    await storage.deleteMany(keys)
    return { failed: 0 }
  } catch (error) {
    console.warn(
      `Could not delete ${keys.length} photo files; they stay in storage`,
      error instanceof Error ? error.message : error,
    )
    return { failed: keys.length }
  }
}
