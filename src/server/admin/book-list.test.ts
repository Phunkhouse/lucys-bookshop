import { describe, expect, it } from 'vitest'
import { parseStatusFilter } from './status-filter'

// The filter comes from the URL, so anything can arrive.
describe('parseStatusFilter', () => {
  it.each(['all', 'available', 'reserved', 'sold', 'hidden'])(
    'accepts %s',
    (value) => {
      expect(parseStatusFilter(value)).toBe(value)
    },
  )

  it.each([
    'bogus',
    'AVAILABLE',
    '',
    ' hidden',
    undefined,
    null,
    ['hidden'],
    42,
  ])('falls back to all for %j', (value) => {
    expect(parseStatusFilter(value)).toBe('all')
  })
})
