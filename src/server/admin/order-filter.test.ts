import { describe, expect, it } from 'vitest'
import { parseStageFilter, STAGE_FILTERS } from './order-filter'

describe('parseStageFilter', () => {
  it.each(STAGE_FILTERS)('accepts %s', (filter) => {
    expect(parseStageFilter(filter)).toBe(filter)
  })

  it('offers every stage and "all", with "all" first', () => {
    expect([...STAGE_FILTERS]).toEqual([
      'all',
      'awaiting_payment',
      'expired',
      'paid',
      'shipped',
      'completed',
      'cancelled',
      'refunded',
    ])
  })

  // The filter comes from the URL, so anything can arrive.
  it.each([undefined, '', 'nonsense', 'PAID', ['paid', 'shipped'], 42, null])(
    'falls back to all for %j',
    (value) => {
      expect(parseStageFilter(value)).toBe('all')
    },
  )
})
