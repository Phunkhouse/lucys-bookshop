import { randomUUID } from 'node:crypto'
import type { AdminActor } from '@/server/auth/require-admin'
import type { ObjectStorage } from './object-storage'
import {
  RENDITIONS,
  UPLOAD_TTL_SECONDS,
  stagingKey,
  type Rendition,
} from './rules'

export type UploadTicket = {
  uploadId: string
  expiresAt: Date
  urls: Record<Rendition, string>
}

// Permission to upload one photo (three files) into the staging area. The server
// picks the id and the keys, so the browser cannot choose where its files go,
// and every URL allows JPEG only.
export async function createUploadTicket(
  _actor: AdminActor,
  storage: ObjectStorage,
  now: Date,
): Promise<UploadTicket> {
  const uploadId = randomUUID()
  const entries = await Promise.all(
    RENDITIONS.map(async (rendition) => [
      rendition,
      await storage.presignPut({
        key: stagingKey(uploadId, rendition),
        contentType: 'image/jpeg',
        expiresInSeconds: UPLOAD_TTL_SECONDS,
      }),
    ]),
  )
  return {
    uploadId,
    expiresAt: new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000),
    urls: Object.fromEntries(entries) as Record<Rendition, string>,
  }
}
