import { describe, expect, it } from 'vitest'
import { computeSizes } from '@/lib/photo-sizes'
import { RENDITIONS } from '@/lib/photo-rules'
import { FakeObjectStorage } from './fake-object-storage'
import { readJpegSize } from './jpeg'
import { stageUpload, stagingKey } from './test-helpers'

// Test data must describe photos a browser really produces. If the default
// sizes of stageUpload drifted from the calculation, tests would be checking
// photos that cannot exist.
describe('stageUpload default sizes', () => {
  it('are exactly what the browser calculates for the large one', async () => {
    const storage = new FakeObjectStorage()
    stageUpload(storage, 'u1')
    const computed = computeSizes(1200, 1600)
    if (!computed.ok) throw new Error('expected sizes')

    for (const rendition of RENDITIONS) {
      const bytes = await storage.readRange(
        stagingKey('u1', rendition),
        0,
        65_535,
      )
      expect(readJpegSize(bytes), rendition).toEqual(computed.sizes[rendition])
    }
  })
})
