// Builds small byte sequences with a real JPEG structure (markers, sizes), for
// tests of the upload checks. They are not viewable pictures: the server reads
// only the header, so that is all the tests need.

type JpegOptions = {
  progressive?: boolean // SOF2 instead of SOF0
  exifBytes?: number // a metadata segment before the image header
  tables?: boolean // quantization table segment before the image header
  totalBytes?: number // pad the picture data so the file is exactly this long
  truncated?: boolean // leave out the end marker, as an interrupted upload would
}

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff]

export function makeJpeg(
  width: number,
  height: number,
  options: JpegOptions = {},
): Uint8Array {
  const head: number[] = [0xff, 0xd8]
  if (options.exifBytes) {
    const payload = new Array<number>(options.exifBytes).fill(0x45)
    head.push(0xff, 0xe1, ...u16(payload.length + 2), ...payload)
  }
  if (options.tables) {
    head.push(0xff, 0xdb, ...u16(67), 0, ...new Array<number>(64).fill(8))
  }
  head.push(
    0xff,
    options.progressive ? 0xc2 : 0xc0,
    ...u16(17),
    8,
    ...u16(height),
    ...u16(width),
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  )
  head.push(0xff, 0xda, ...u16(12), 3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0)

  const end = options.truncated ? [] : [0xff, 0xd9]
  const scanLength = Math.max(
    16,
    (options.totalBytes ?? 0) - head.length - end.length,
  )
  // Picture data without 0xff, so no accidental markers appear.
  const scan = new Array<number>(scanLength).fill(0x12)

  return Uint8Array.from([...head, ...scan, ...end])
}

export function makePng(): Uint8Array {
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...new Array<number>(64).fill(0),
  ])
}
