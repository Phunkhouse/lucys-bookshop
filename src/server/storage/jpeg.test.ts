import { describe, expect, it } from 'vitest'
import { readJpegSize } from './jpeg'
import { makeJpeg, makePng } from './test-jpeg'

describe('readJpegSize', () => {
  it('reads the width and height of a baseline JPEG', () => {
    expect(readJpegSize(makeJpeg(1200, 1600))).toEqual({
      width: 1200,
      height: 1600,
    })
  })

  it('reads a progressive JPEG too', () => {
    expect(readJpegSize(makeJpeg(960, 720, { progressive: true }))).toEqual({
      width: 960,
      height: 720,
    })
  })

  it('skips metadata and table segments that come before the image header', () => {
    expect(
      readJpegSize(makeJpeg(480, 640, { exifBytes: 20_000, tables: true })),
    ).toEqual({ width: 480, height: 640 })
  })

  it('reads a size larger than 255 in both directions (two-byte numbers)', () => {
    expect(readJpegSize(makeJpeg(1599, 1))).toEqual({ width: 1599, height: 1 })
    expect(readJpegSize(makeJpeg(256, 65535))).toEqual({
      width: 256,
      height: 65535,
    })
  })

  it('gives null when the file is not a JPEG', () => {
    expect(readJpegSize(makePng())).toBeNull()
    expect(readJpegSize(new Uint8Array())).toBeNull()
    expect(readJpegSize(Uint8Array.from([0xff]))).toBeNull()
    expect(
      readJpegSize(new TextEncoder().encode('<html>nope</html>')),
    ).toBeNull()
  })

  it('gives null when the image header is missing or cut off', () => {
    const whole = makeJpeg(1200, 1600)
    expect(readJpegSize(whole.slice(0, 2))).toBeNull() // only the start marker
    expect(readJpegSize(whole.slice(0, 10))).toBeNull() // header cut in the middle
    expect(
      readJpegSize(makeJpeg(1200, 1600, { exifBytes: 5000 }).slice(0, 3000)),
    ).toBeNull()
  })

  it('gives null for a size of zero', () => {
    expect(readJpegSize(makeJpeg(0, 1600))).toBeNull()
    expect(readJpegSize(makeJpeg(1200, 0))).toBeNull()
  })
})
