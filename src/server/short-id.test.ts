import { describe, expect, it } from 'vitest'
import { generateShortId } from './short-id'

describe('generateShortId', () => {
  it('makes 8 lowercase letters and digits, as the database requires', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateShortId()).toMatch(/^[0-9a-z]{8}$/)
    }
  })

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateShortId()))

    expect(ids.size).toBe(1000)
  })
})
