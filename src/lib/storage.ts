import { env } from '@/config/env'
import { S3ObjectStorage } from '@/server/storage/s3-object-storage'

// The photo storage: Cloudflare R2 in production, the local S3-compatible
// server in development. Which one is decided by the STORAGE_* settings.
export const storage = new S3ObjectStorage({
  endpoint: env.STORAGE_ENDPOINT,
  bucket: env.STORAGE_BUCKET,
  accessKeyId: env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  region: env.STORAGE_REGION,
  forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
})
