// Reads the pixel size from the header of a JPEG, without decoding it. The
// server never trusts the size the browser reports: this is the real one.
//
// A JPEG is a series of segments: 0xFF, a marker byte, a two-byte length, then
// data. The size sits in the "start of frame" segment, which comes after
// metadata such as EXIF.

const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 && // define Huffman table
  marker !== 0xc8 && // reserved
  marker !== 0xcc // define arithmetic coding

export function readJpegSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null // lost track of the segments
    const marker = bytes[i + 1]
    if (marker === 0xff) {
      i += 1 // padding
      continue
    }
    // Markers without a length: start of image, restart markers, TEM.
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2
      continue
    }
    // The picture data begins or ends before any size was seen.
    if (marker === 0xd9 || marker === 0xda) return null

    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    if (length < 2) return null

    if (isStartOfFrame(marker)) {
      if (i + 9 > bytes.length) return null
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      if (width === 0 || height === 0) return null
      return { width, height }
    }
    i += 2 + length
  }
  return null
}
