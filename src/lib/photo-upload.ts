import { RENDITIONS, type Rendition } from './photo-rules'
import type { ResizeError, ResizeResult } from './photo-resize'

export type UploadTicket = {
  uploadId: string
  expiresAt: string
  urls: Record<Rendition, string>
}

// What the browser provides, injected so the order and the failure handling can
// be tested: making the sizes, asking for permission, sending a file.
export type UploadDeps = {
  resize(file: Blob): Promise<ResizeResult>
  createTicket(): Promise<UploadTicket>
  put(
    url: string,
    body: Blob,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<{ status: number }>
}

export type PhotoUploadResult =
  | { ok: true; uploadId: string; previewBlob: Blob }
  | { ok: false; error: ResizeError | 'uploadFailed' }

// Resizes a photo, then asks the server for permission, then sends the three
// sizes straight to the storage. The permission is asked for only after the
// resize worked, so a photo that cannot be read never costs one. An aborted
// upload rejects with an AbortError.
export async function uploadPhoto(
  file: Blob,
  deps: UploadDeps,
  signal?: AbortSignal,
): Promise<PhotoUploadResult> {
  const resized = await deps.resize(file)
  signal?.throwIfAborted()
  if (!resized.ok) return { ok: false, error: resized.error }

  let ticket: UploadTicket
  try {
    ticket = await deps.createTicket()
  } catch {
    signal?.throwIfAborted()
    return { ok: false, error: 'uploadFailed' }
  }
  signal?.throwIfAborted()

  try {
    const answers = await Promise.all(
      RENDITIONS.map((rendition) =>
        deps.put(
          ticket.urls[rendition],
          resized.files[rendition],
          'image/jpeg',
          signal,
        ),
      ),
    )
    if (answers.some((answer) => answer.status < 200 || answer.status >= 300)) {
      return { ok: false, error: 'uploadFailed' }
    }
  } catch {
    signal?.throwIfAborted()
    return { ok: false, error: 'uploadFailed' }
  }

  return {
    ok: true,
    uploadId: ticket.uploadId,
    previewBlob: resized.files.thumb,
  }
}
