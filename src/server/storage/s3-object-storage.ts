import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { ObjectStorage } from './object-storage'

export type S3StorageConfig = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  // MinIO needs path-style addresses (host/bucket/key); R2 works with either.
  forcePathStyle: boolean
}

// Cloudflare R2, MinIO or any other S3-compatible service.
export class S3ObjectStorage implements ObjectStorage {
  private client: S3Client
  private bucket: string

  // `client` is for tests, which stand in for the server.
  constructor(config: S3StorageConfig, client?: S3Client) {
    this.bucket = config.bucket
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        // Recent SDKs add checksum headers to every request by default. R2 and
        // MinIO do not need them, and a presigned URL would then carry a checksum
        // the browser cannot produce.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      })
  }

  presignPut(input: {
    key: string
    contentType: string
    expiresInSeconds: number
  }) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
      }),
      {
        expiresIn: input.expiresInSeconds,
        // Without this the SDK signs only the host, and the browser could send
        // any content type with the upload.
        signableHeaders: new Set(['content-type']),
      },
    )
  }

  async head(key: string) {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
        cacheControl: result.CacheControl ?? null,
      }
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async readRange(key: string, start: number, end: number) {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }),
    )
    return result.Body
      ? await result.Body.transformToByteArray()
      : new Uint8Array()
  }

  async copy(
    fromKey: string,
    toKey: string,
    options: { cacheControl?: string } = {},
  ) {
    const source = `${this.bucket}/${encodeURIComponent(fromKey).replaceAll('%2F', '/')}`
    if (!options.cacheControl) {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          Key: toKey,
          CopySource: source,
        }),
      )
      return
    }

    // Setting a header means replacing the metadata, and replacing it drops the
    // content type unless it is given again.
    const original = await this.head(fromKey)
    if (!original) throw new Error(`No such key: ${fromKey}`)
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: toKey,
        CopySource: source,
        MetadataDirective: 'REPLACE',
        ContentType: original.contentType ?? undefined,
        CacheControl: options.cacheControl,
      }),
    )
  }

  async deleteMany(keys: string[]) {
    const failures: { key?: string; code?: string }[] = []

    // At most 1000 keys per request. Every batch is tried, so one failure does
    // not leave the rest undeleted.
    for (let i = 0; i < keys.length; i += 1000) {
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      )
      // A request that succeeds can still list files that were not deleted
      // (quiet mode reports only these). A file that was already gone is fine.
      for (const error of result.Errors ?? []) {
        if (error.Code !== 'NoSuchKey') {
          failures.push({ key: error.Key, code: error.Code })
        }
      }
    }

    if (failures.length > 0) {
      const codes = [...new Set(failures.map((f) => f.code ?? 'unknown'))]
      throw new Error(
        `Could not delete ${failures.length} of ${keys.length} files (${codes.join(', ')})`,
      )
    }
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404
}
