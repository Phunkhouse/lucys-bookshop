import { describe, expect, inject, it } from 'vitest'
import { describeStorageContract } from './storage-contract'
import { S3ObjectStorage } from './s3-object-storage'

// Against a real S3-compatible server: MinIO from docker compose (pnpm db:up)
// and, in CI, the MinIO service container. The bucket is created for this run
// by the global setup and removed afterwards, like the throwaway database.
const config = () => inject('testStorage')

describeStorageContract('S3ObjectStorage (MinIO)', () => ({
  storage: new S3ObjectStorage(config()),
  upload: async (url, body, contentType) => {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: body as BodyInit,
    })
    return { status: response.status }
  },
}))

describe('S3ObjectStorage presigned URLs', () => {
  // Presigning is a local calculation, so this needs no server.
  const storage = new S3ObjectStorage({
    endpoint: 'https://account123.r2.cloudflarestorage.com',
    bucket: 'shop',
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret-for-the-test',
    region: 'auto',
    forcePathStyle: false,
  })

  it('binds the URL to the key and the content type, and to the time given', async () => {
    const url = new URL(
      await storage.presignPut({
        key: 'uploads/abc/thumb.jpg',
        contentType: 'image/jpeg',
        expiresInSeconds: 600,
      }),
    )

    expect(url.pathname + url.hostname).toContain('uploads/abc/thumb.jpg')
    expect(url.hostname).toContain('account123.r2.cloudflarestorage.com')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'content-type',
    )
  })
})
