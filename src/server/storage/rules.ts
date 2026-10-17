// The rules for photo uploads (spec 6.9 and 10). The browser makes three sizes
// of every photo; the server checks them against these numbers.

import type { Rendition } from '@/lib/photo-rules'

// The numbers shared with the browser live in src/lib/photo-rules.ts.
export {
  ASPECT_TOLERANCE,
  MAX_FILE_BYTES,
  MAX_LONG_EDGE,
  RENDITIONS,
  type Rendition,
} from '@/lib/photo-rules'

// Saved photos never change: a changed photo is a new file at a new address. So
// browsers may keep them for a year without asking again.
export const PHOTO_CACHE_CONTROL = 'public, max-age=31536000, immutable'

// A presigned upload permission is valid for 10 minutes.
export const UPLOAD_TTL_SECONDS = 600

// Where a photo waits between the upload and the save. An R2 lifecycle rule
// removes whatever is left here after a day (docs/storage-setup.md).
export const stagingKey = (uploadId: string, rendition: Rendition) =>
  `uploads/${uploadId}/${rendition}.jpg`

// Where it lives once saved with a book.
export const finalKey = (baseKey: string, rendition: Rendition) =>
  `${baseKey}/${rendition}.jpg`
