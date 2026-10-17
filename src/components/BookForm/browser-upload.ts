import { createUploadTicketAction } from '@/app/[locale]/admin/books/actions'
import { browserResizeDeps } from '@/lib/photo-resize-browser'
import { resizeToJpegs } from '@/lib/photo-resize'
import { uploadPhoto } from '@/lib/photo-upload'
import type { UploadOutcome } from '@/components/PhotoPicker'

// The real upload, with the browser's own tools: canvas to make the three sizes,
// the server action for permission, fetch to send the files to the storage. The
// form loads this only when a photo is chosen, so it costs nothing before.
export async function browserUpload(
  file: File,
  signal: AbortSignal,
): Promise<UploadOutcome> {
  const result = await uploadPhoto(
    file,
    {
      resize: (blob) => resizeToJpegs(blob, browserResizeDeps),
      createTicket: createUploadTicketAction,
      put: async (url, body, contentType, abort) => {
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'content-type': contentType },
          body,
          signal: abort,
        })
        return { status: response.status }
      },
    },
    signal,
  )
  if (!result.ok) return result
  return {
    ok: true,
    uploadId: result.uploadId,
    previewUrl: URL.createObjectURL(result.previewBlob),
  }
}
