import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ObjectStorage } from './object-storage'

// What every ObjectStorage must do, whichever service is behind it. Run against
// the in-memory fake (unit) and against a real S3-compatible server (MinIO, in
// the integration project), so the fake cannot drift from the real thing.

export type ContractTarget = {
  storage: ObjectStorage
  // Does what the browser does with a presigned URL.
  upload: (
    url: string,
    body: Uint8Array,
    contentType: string,
  ) => Promise<{ status: number }>
}

const bytes = (...values: number[]) => Uint8Array.from(values)

export function describeStorageContract(
  name: string,
  makeTarget: () => Promise<ContractTarget> | ContractTarget,
) {
  describe(`${name}: the ObjectStorage contract`, () => {
    let target: ContractTarget
    let prefix: string

    beforeEach(async () => {
      target = await makeTarget()
      prefix = `contract/${randomUUID()}`
    })

    async function put(
      key: string,
      body: Uint8Array,
      contentType = 'image/jpeg',
    ) {
      const url = await target.storage.presignPut({
        key,
        contentType,
        expiresInSeconds: 600,
      })
      const result = await target.upload(url, body, contentType)
      expect(result.status).toBe(200)
    }

    it('reports a missing object as null', async () => {
      expect(await target.storage.head(`${prefix}/nothing.jpg`)).toBeNull()
    })

    it('stores what a presigned URL receives, and reports its size and type', async () => {
      await put(`${prefix}/a.jpg`, bytes(1, 2, 3, 4, 5))

      expect(await target.storage.head(`${prefix}/a.jpg`)).toEqual({
        size: 5,
        contentType: 'image/jpeg',
      })
    })

    it('refuses an upload with a different content type than was signed', async () => {
      const url = await target.storage.presignPut({
        key: `${prefix}/b.jpg`,
        contentType: 'image/jpeg',
        expiresInSeconds: 600,
      })

      const result = await target.upload(url, bytes(1, 2, 3), 'image/png')

      expect(result.status).toBe(403)
      expect(await target.storage.head(`${prefix}/b.jpg`)).toBeNull()
    })

    it('reads an exact byte range, both ends included, and stops at the end of the object', async () => {
      await put(`${prefix}/c.jpg`, bytes(10, 11, 12, 13, 14, 15))

      expect(await target.storage.readRange(`${prefix}/c.jpg`, 1, 3)).toEqual(
        bytes(11, 12, 13),
      )
      expect(await target.storage.readRange(`${prefix}/c.jpg`, 4, 100)).toEqual(
        bytes(14, 15),
      )
    })

    it('copies an object, keeping the original', async () => {
      await put(`${prefix}/from.jpg`, bytes(9, 8, 7))

      await target.storage.copy(`${prefix}/from.jpg`, `${prefix}/to.jpg`)

      expect(await target.storage.head(`${prefix}/to.jpg`)).toEqual({
        size: 3,
        contentType: 'image/jpeg',
      })
      expect(await target.storage.readRange(`${prefix}/to.jpg`, 0, 2)).toEqual(
        bytes(9, 8, 7),
      )
      expect(await target.storage.head(`${prefix}/from.jpg`)).not.toBeNull()
    })

    it('fails to copy an object that does not exist', async () => {
      await expect(
        target.storage.copy(`${prefix}/ghost.jpg`, `${prefix}/to.jpg`),
      ).rejects.toThrow()
      expect(await target.storage.head(`${prefix}/to.jpg`)).toBeNull()
    })

    it('deletes several objects at once, and does not mind ones that are not there', async () => {
      await put(`${prefix}/d1.jpg`, bytes(1))
      await put(`${prefix}/d2.jpg`, bytes(2))

      await target.storage.deleteMany([
        `${prefix}/d1.jpg`,
        `${prefix}/d2.jpg`,
        `${prefix}/never-existed.jpg`,
      ])

      expect(await target.storage.head(`${prefix}/d1.jpg`)).toBeNull()
      expect(await target.storage.head(`${prefix}/d2.jpg`)).toBeNull()
    })

    it('does nothing for an empty list of keys', async () => {
      await expect(target.storage.deleteMany([])).resolves.toBeUndefined()
    })
  })
}
