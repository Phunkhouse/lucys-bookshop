import { render, screen } from '@testing-library/react'
import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { qrMatrix } from './qr-matrix'
import { QrCode } from './QrCode'
import { TEST_IBAN } from '@/server/test-iban'

// Reads the matrix back the way a phone would, from pixels.
function decode(matrix: boolean[][]) {
  const scale = 4
  const quiet = 4
  const size = (matrix.length + quiet * 2) * scale
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255)
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const at =
            ((y + quiet) * scale + dy) * size * 4 +
            ((x + quiet) * scale + dx) * 4
          pixels[at] = pixels[at + 1] = pixels[at + 2] = 0
        }
      }
    }),
  )
  return jsQR(pixels, size, size)?.data ?? null
}

const SPAYD = `SPD*1.0*ACC:${TEST_IBAN}*AM:667.00*CC:CZK*X-VS:20260042*MSG:OBJEDNAVKA 20260042`

describe('qrMatrix', () => {
  it('encodes the payment string so that a scanner reads exactly it back', () => {
    expect(decode(qrMatrix(SPAYD))).toBe(SPAYD)
  })

  it('reads back strings of different lengths and with a different amount', () => {
    const other = SPAYD.replace('667.00', '0.05')
    expect(decode(qrMatrix(other))).toBe(other)
    expect(decode(qrMatrix(`SPD*1.0*ACC:${TEST_IBAN}`))).toBe(
      `SPD*1.0*ACC:${TEST_IBAN}`,
    )
  })

  it('is square, and the same text always gives the same picture', () => {
    const a = qrMatrix(SPAYD)
    expect(a.every((row) => row.length === a.length)).toBe(true)
    expect(qrMatrix(SPAYD)).toEqual(a)
  })
})

describe('QrCode', () => {
  it('is an image with a text alternative, black on white with a quiet zone', () => {
    render(<QrCode value={SPAYD} label="QR kód pro platbu" />)

    const image = screen.getByRole('img', { name: 'QR kód pro platbu' })
    expect(image.tagName.toLowerCase()).toBe('svg')
    const viewBox = image.getAttribute('viewBox')!.split(' ').map(Number)
    const modules = qrMatrix(SPAYD).length
    // Four modules of quiet zone on every side.
    expect(viewBox).toEqual([0, 0, modules + 8, modules + 8])
    expect(image.querySelector('rect')?.getAttribute('fill')).toBe('#fff')
    expect(image.querySelector('path')?.getAttribute('fill')).toBe('#000')
  })

  it('draws the same modules the matrix has', () => {
    render(<QrCode value={SPAYD} label="QR" />)
    const d = screen.getByRole('img').querySelector('path')!.getAttribute('d')!
    const dark = qrMatrix(SPAYD).flat().filter(Boolean).length
    // One "M x y h1 v1 h-1z" square per dark module.
    expect(d.split('M').length - 1).toBe(dark)
  })
})
