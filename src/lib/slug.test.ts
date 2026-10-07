import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(slugify('Válka s Mloky')).toBe('valka-s-mloky')
  })

  it('removes Czech diacritics', () => {
    expect(slugify('Příliš žluťoučký kůň')).toBe('prilis-zlutoucky-kun')
  })

  it('drops punctuation and collapses repeated separators', () => {
    expect(slugify('  Hello,   World!!  ')).toBe('hello-world')
  })

  it('caps the length at 60 characters without a trailing hyphen', () => {
    const slug = slugify('word '.repeat(30))
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('returns an empty string when nothing usable is left', () => {
    expect(slugify('!!!')).toBe('')
  })
})
