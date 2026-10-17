import { MAX_FILE_BYTES, RENDITIONS, type Rendition } from './photo-rules'
import { computeSizes } from './photo-sizes'

// What the browser provides: decoding a file and drawing it at a size. They are
// injected, so the decisions around them can be tested without a browser.
export type Decoded = { width: number; height: number; close(): void }

export type ResizeDeps = {
  decode(file: Blob): Promise<Decoded>
  encode(
    decoded: Decoded,
    size: { width: number; height: number },
    quality: number,
  ): Promise<Blob>
}

export type ResizeError = 'unreadable' | 'tooLarge' | 'tooExtreme'

export type ResizeResult =
  | {
      ok: true
      files: Record<Rendition, Blob>
      // The size of the large one.
      width: number
      height: number
    }
  | { ok: false; error: ResizeError }

// Quality 0.85 first; a file over 2 MB is made again at lower quality.
const QUALITIES = [0.85, 0.75, 0.65]

// Makes the three JPEGs of a photo. Re-encoding also drops the photo's
// metadata, including the location it was taken at.
export async function resizeToJpegs(
  file: Blob,
  deps: ResizeDeps,
): Promise<ResizeResult> {
  let decoded: Decoded
  try {
    decoded = await deps.decode(file)
  } catch {
    // Not an image the browser can read, for example HEIC in Chrome.
    return { ok: false, error: 'unreadable' }
  }

  try {
    if (!(decoded.width > 0 && decoded.height > 0)) {
      return { ok: false, error: 'unreadable' }
    }
    const computed = computeSizes(decoded.width, decoded.height)
    if (!computed.ok) return { ok: false, error: computed.error }

    const files = {} as Record<Rendition, Blob>
    for (const rendition of RENDITIONS) {
      let made: Blob | null = null
      for (const quality of QUALITIES) {
        const blob = await deps.encode(
          decoded,
          computed.sizes[rendition],
          quality,
        )
        if (blob.size <= MAX_FILE_BYTES) {
          made = blob
          break
        }
      }
      if (!made) return { ok: false, error: 'tooLarge' }
      files[rendition] = made
    }
    return {
      ok: true,
      files,
      width: computed.sizes.large.width,
      height: computed.sizes.large.height,
    }
  } catch {
    return { ok: false, error: 'unreadable' }
  } finally {
    // A decoded photo can take tens of megabytes on a phone.
    decoded.close()
  }
}
