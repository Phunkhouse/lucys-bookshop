import type { S3Client } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'
import { S3ObjectStorage } from './s3-object-storage'

// A bulk delete is one request. S3-compatible servers can answer it with
// success (HTTP 200) and still list files they failed to delete, so the answer
// has to be read. These tests stand in for the server and answer by hand.

const config = {
  endpoint: 'http://127.0.0.1:9000',
  bucket: 'shop',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret-for-the-test',
  region: 'us-east-1',
  forcePathStyle: true,
}

type Answer = { Errors?: { Key?: string; Code?: string; Message?: string }[] }

function storageAnswering(...answers: Answer[]) {
  const requests: string[][] = []
  const send = vi.fn(
    async (command: { input: { Delete: { Objects: { Key: string }[] } } }) => {
      requests.push(command.input.Delete.Objects.map((o) => o.Key))
      return answers[requests.length - 1] ?? {}
    },
  )
  return {
    storage: new S3ObjectStorage(config, { send } as unknown as S3Client),
    requests,
  }
}

const keys = (count: number) =>
  Array.from({ length: count }, (_, i) => `books/b/${i}.jpg`)

describe('S3ObjectStorage.deleteMany answers', () => {
  it('resolves when the server reports no errors', async () => {
    const { storage } = storageAnswering({})

    await expect(
      storage.deleteMany(['a.jpg', 'b.jpg']),
    ).resolves.toBeUndefined()
  })

  it('throws when the server says some files could not be deleted, even though the request succeeded', async () => {
    const { storage } = storageAnswering({
      Errors: [{ Key: 'b.jpg', Code: 'AccessDenied', Message: 'no' }],
    })

    await expect(storage.deleteMany(['a.jpg', 'b.jpg'])).rejects.toThrow(
      /1 of 2[\s\S]*AccessDenied/,
    )
  })

  it('does not count a file that was already gone as a failure', async () => {
    const { storage } = storageAnswering({
      Errors: [{ Key: 'a.jpg', Code: 'NoSuchKey' }],
    })

    await expect(storage.deleteMany(['a.jpg'])).resolves.toBeUndefined()
  })

  it('still throws when a missing file and a real failure are reported together', async () => {
    const { storage } = storageAnswering({
      Errors: [
        { Key: 'a.jpg', Code: 'NoSuchKey' },
        { Key: 'b.jpg', Code: 'InternalError' },
      ],
    })

    await expect(storage.deleteMany(['a.jpg', 'b.jpg'])).rejects.toThrow(
      /InternalError/,
    )
  })

  it('sends more than 1000 keys in several requests, deletes everything it can, then reports the failures', async () => {
    const { storage, requests } = storageAnswering(
      { Errors: [{ Key: 'books/b/3.jpg', Code: 'InternalError' }] }, // first request
      {}, // second request
    )

    await expect(storage.deleteMany(keys(1500))).rejects.toThrow(/1 of 1500/)

    expect(requests.map((r) => r.length)).toEqual([1000, 500])
  })

  it('sends nothing for an empty list', async () => {
    const { storage, requests } = storageAnswering()

    await storage.deleteMany([])

    expect(requests).toEqual([])
  })
})
