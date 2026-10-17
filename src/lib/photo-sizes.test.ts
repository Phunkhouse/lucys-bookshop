import { describe, expect, it } from 'vitest'
import { FakeObjectStorage } from '@/server/storage/fake-object-storage'
import { stageUpload } from '@/server/storage/test-helpers'
import { verifyUpload } from '@/server/storage/verify-upload'
import { computeSizes } from './photo-sizes'

const sizesOf = (width: number, height: number) => {
  const result = computeSizes(width, height)
  if (!result.ok) throw new Error('expected sizes')
  return result.sizes
}

describe('computeSizes', () => {
  it('scales a portrait photo to the three sizes', () => {
    expect(sizesOf(3000, 4000)).toEqual({
      large: { width: 1200, height: 1600 },
      medium: { width: 720, height: 960 },
      thumb: { width: 360, height: 480 },
    })
  })

  it('scales a landscape photo and a square one the same way', () => {
    expect(sizesOf(4000, 3000)).toEqual({
      large: { width: 1600, height: 1200 },
      medium: { width: 960, height: 720 },
      thumb: { width: 480, height: 360 },
    })
    expect(sizesOf(2000, 2000)).toEqual({
      large: { width: 1600, height: 1600 },
      medium: { width: 960, height: 960 },
      thumb: { width: 480, height: 480 },
    })
  })

  it('never enlarges a photo', () => {
    expect(sizesOf(300, 400)).toEqual({
      large: { width: 300, height: 400 },
      medium: { width: 300, height: 400 },
      thumb: { width: 300, height: 400 },
    })
    expect(sizesOf(800, 1000)).toEqual({
      large: { width: 800, height: 1000 },
      medium: { width: 768, height: 960 },
      thumb: { width: 384, height: 480 },
    })
  })

  it('accepts a shape up to 4:1 either way and refuses a more extreme one', () => {
    expect(computeSizes(4000, 1000).ok).toBe(true)
    expect(computeSizes(1000, 4000).ok).toBe(true)
    // Rounding to whole pixels would break the server's proportion check.
    expect(computeSizes(4001, 1000)).toEqual({ ok: false, error: 'tooExtreme' })
    expect(computeSizes(1000, 4001)).toEqual({ ok: false, error: 'tooExtreme' })
  })

  it('refuses sizes that make no sense', () => {
    for (const [w, h] of [
      [0, 100],
      [100, 0],
      [-5, 100],
      [Number.NaN, 100],
    ]) {
      expect(computeSizes(w, h)).toEqual({ ok: false, error: 'tooExtreme' })
    }
  })

  // The browser and the server must agree: whatever this produces has to pass
  // the server's checks (long edges, order, proportions within 2%).
  it('produces sizes the server accepts, for a wide range of photos', async () => {
    let seed = 20261017
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const shapes: [number, number][] = [
      [1, 1],
      [10, 13],
      [37, 41],
      [100, 400],
      [399, 400],
      [1279, 1707],
      [3024, 4032],
      [4032, 3024],
      [5712, 4284],
      [8000, 6000],
      [4000, 1000],
      [1000, 4000],
      [3999, 1000],
      ...Array.from({ length: 150 }, (): [number, number] => [
        1 + Math.floor(next() * 9000),
        1 + Math.floor(next() * 9000),
      ]),
    ]

    let accepted = 0
    for (const [width, height] of shapes) {
      const result = computeSizes(width, height)
      const extreme = Math.max(width / height, height / width) > 4
      expect(result.ok, `${width}x${height}`).toBe(!extreme)
      if (!result.ok) continue

      const storage = new FakeObjectStorage()
      stageUpload(storage, 'u1', result.sizes)
      expect(
        await verifyUpload(storage, 'u1'),
        `${width}x${height}`,
      ).toMatchObject({
        ok: true,
      })
      accepted++
    }
    expect(accepted).toBeGreaterThan(100)
  })
})
