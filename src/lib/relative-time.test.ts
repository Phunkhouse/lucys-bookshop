import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relative-time'

const now = new Date('2026-10-09T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(now.getTime() - ms)
const format = (ms: number) => formatRelativeTime(ago(ms), now, 'cs')

describe('formatRelativeTime', () => {
  it('says dnes for less than a day, however many hours', () => {
    expect(format(0)).toBe('dnes')
    expect(format(23 * HOUR)).toBe('dnes')
  })

  it('counts days up to 6', () => {
    expect(format(1 * DAY)).toBe('včera')
    expect(format(5 * DAY)).toBe('před 5 dny')
    expect(format(6 * DAY)).toBe('před 6 dny')
  })

  it('switches to weeks at 7 days and to months at 30', () => {
    expect(format(7 * DAY)).toBe('minulý týden')
    expect(format(21 * DAY)).toBe('před 3 týdny')
    expect(format(29 * DAY)).toBe('před 4 týdny')
    expect(format(30 * DAY)).toBe('minulý měsíc')
    expect(format(90 * DAY)).toBe('před 3 měsíci')
  })

  it('switches to years at 365 days', () => {
    expect(format(364 * DAY)).toBe('před 12 měsíci')
    expect(format(365 * DAY)).toBe('minulý rok')
  })

  it('never shows a future date (clock skew): it says dnes', () => {
    expect(
      formatRelativeTime(new Date(now.getTime() + 5 * HOUR), now, 'cs'),
    ).toBe('dnes')
  })
})
