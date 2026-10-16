// The rules for photo uploads (spec 6.9 and 10). The browser makes three sizes
// of every photo; the server checks them against these numbers.

export const RENDITIONS = ['thumb', 'medium', 'large'] as const
export type Rendition = (typeof RENDITIONS)[number]

export const MAX_FILE_BYTES = 2 * 1024 * 1024
// Longest edge of each size, in pixels. A smaller original is not upscaled, so
// smaller is fine.
export const MAX_LONG_EDGE: Record<Rendition, number> = {
  thumb: 480,
  medium: 960,
  large: 1600,
}
// The three sizes must show the same picture: proportions within 2%.
export const ASPECT_TOLERANCE = 0.02
// A presigned upload permission is valid for 10 minutes.
export const UPLOAD_TTL_SECONDS = 600

// Where a photo waits between the upload and the save. An R2 lifecycle rule
// removes whatever is left here after a day (docs/storage-setup.md).
export const stagingKey = (uploadId: string, rendition: Rendition) =>
  `uploads/${uploadId}/${rendition}.jpg`

// Where it lives once saved with a book.
export const finalKey = (baseKey: string, rendition: Rendition) =>
  `${baseKey}/${rendition}.jpg`
