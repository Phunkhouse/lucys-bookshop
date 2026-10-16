import { describe, expect, it } from 'vitest'
import { testActor } from '@/server/auth/test-helpers'
import { FakeObjectStorage } from './fake-object-storage'
import { UPLOAD_TTL_SECONDS } from './rules'
import { createUploadTicket } from './upload-ticket'

const now = new Date('2026-10-16T12:00:00.000Z')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('createUploadTicket', () => {
  it('gives a new id and one URL for each of the three sizes, in the staging area', async () => {
    const actor = await testActor()
    const storage = new FakeObjectStorage()

    const ticket = await createUploadTicket(actor, storage, now)

    expect(ticket.uploadId).toMatch(UUID)
    expect(Object.keys(ticket.urls).sort()).toEqual([
      'large',
      'medium',
      'thumb',
    ])
    expect(storage.presigned.map((p) => p.key).sort()).toEqual([
      `uploads/${ticket.uploadId}/large.jpg`,
      `uploads/${ticket.uploadId}/medium.jpg`,
      `uploads/${ticket.uploadId}/thumb.jpg`,
    ])
  })

  it('allows only JPEG, for 10 minutes, and says when it runs out', async () => {
    const actor = await testActor()
    const storage = new FakeObjectStorage()

    const ticket = await createUploadTicket(actor, storage, now)

    expect(UPLOAD_TTL_SECONDS).toBe(600)
    for (const presigned of storage.presigned) {
      expect(presigned.contentType).toBe('image/jpeg')
      expect(presigned.expiresInSeconds).toBe(600)
    }
    expect(ticket.expiresAt).toEqual(new Date(now.getTime() + 600_000))
  })

  it("never reuses an id, and the keys are the server's choice alone", async () => {
    const actor = await testActor()
    const storage = new FakeObjectStorage()

    const first = await createUploadTicket(actor, storage, now)
    const second = await createUploadTicket(actor, storage, now)

    expect(first.uploadId).not.toBe(second.uploadId)
    expect(Object.values(first.urls)).not.toContain(second.urls.thumb)
  })
})
