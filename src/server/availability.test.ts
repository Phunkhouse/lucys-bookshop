import { describe, expect, it } from 'vitest'
import {
  displayStatus,
  isBuyable,
  isListedInCatalog,
  type AvailabilityFields,
} from './availability'

const now = new Date('2026-10-08T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

// Builds a date relative to the fixed `now`. No real clock, no sleeps.
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

function book(fields: Partial<AvailabilityFields>): AvailabilityFields {
  return { status: 'available', reservedUntil: null, soldAt: null, ...fields }
}

describe('displayStatus', () => {
  it('shows an available book as available', () => {
    expect(displayStatus(book({ status: 'available' }), now)).toBe('available')
  })

  it('shows a reserved book with a future deadline as reserved', () => {
    const b = book({ status: 'reserved', reservedUntil: at(HOUR) })
    expect(displayStatus(b, now)).toBe('reserved')
  })

  it('treats a reserved book with a past deadline as available (lazy expiry)', () => {
    const b = book({ status: 'reserved', reservedUntil: at(-HOUR) })
    expect(displayStatus(b, now)).toBe('available')
  })

  it('keeps a book reserved at exactly the deadline', () => {
    const b = book({ status: 'reserved', reservedUntil: at(0) })
    expect(displayStatus(b, now)).toBe('reserved')
  })

  it('treats a book as available one millisecond after the deadline', () => {
    const b = book({ status: 'reserved', reservedUntil: at(-1) })
    expect(displayStatus(b, now)).toBe('available')
  })

  it('fails safe: a reserved book without a deadline stays reserved', () => {
    const b = book({ status: 'reserved', reservedUntil: null })
    expect(displayStatus(b, now)).toBe('reserved')
  })

  it.each([1, 100])('shows a book sold %i days ago as sold', (days) => {
    const b = book({ status: 'sold', soldAt: at(-days * DAY) })
    expect(displayStatus(b, now)).toBe('sold')
  })

  it('shows a hidden book as hidden, ignoring an expired reservation', () => {
    const b = book({ status: 'hidden', reservedUntil: at(-HOUR) })
    expect(displayStatus(b, now)).toBe('hidden')
  })
})

describe('isBuyable', () => {
  it('is true for an available book', () => {
    expect(isBuyable(book({ status: 'available' }), now)).toBe(true)
  })

  it('is true for a book whose reservation has expired', () => {
    const b = book({ status: 'reserved', reservedUntil: at(-HOUR) })
    expect(isBuyable(b, now)).toBe(true)
  })

  it.each([
    ['reserved', book({ status: 'reserved', reservedUntil: at(HOUR) })],
    ['sold', book({ status: 'sold', soldAt: at(-DAY) })],
    ['hidden', book({ status: 'hidden' })],
  ])('is false for a %s book', (_name, b) => {
    expect(isBuyable(b, now)).toBe(false)
  })
})

describe('isListedInCatalog', () => {
  it('lists an available book', () => {
    expect(isListedInCatalog(book({ status: 'available' }), now)).toBe(true)
  })

  it('lists a reserved book with a future deadline', () => {
    const b = book({ status: 'reserved', reservedUntil: at(HOUR) })
    expect(isListedInCatalog(b, now)).toBe(true)
  })

  it('lists a book whose reservation has expired', () => {
    const b = book({ status: 'reserved', reservedUntil: at(-HOUR) })
    expect(isListedInCatalog(b, now)).toBe(true)
  })

  it('lists a book sold 13 days and 23 hours ago', () => {
    const b = book({ status: 'sold', soldAt: at(-(14 * DAY - HOUR)) })
    expect(isListedInCatalog(b, now)).toBe(true)
  })

  it('does not list a book sold exactly 14 days ago', () => {
    const b = book({ status: 'sold', soldAt: at(-14 * DAY) })
    expect(isListedInCatalog(b, now)).toBe(false)
  })

  it('does not list a book sold 14 days and 1 millisecond ago', () => {
    const b = book({ status: 'sold', soldAt: at(-14 * DAY - 1) })
    expect(isListedInCatalog(b, now)).toBe(false)
  })

  it('does not list a sold book of unknown age', () => {
    const b = book({ status: 'sold', soldAt: null })
    expect(isListedInCatalog(b, now)).toBe(false)
  })

  it('never lists a hidden book, even with listable dates', () => {
    const b = book({
      status: 'hidden',
      soldAt: at(-DAY),
      reservedUntil: at(HOUR),
    })
    expect(isListedInCatalog(b, now)).toBe(false)
  })

  it('lists a book whose sold date is in the future (clock skew)', () => {
    const b = book({ status: 'sold', soldAt: at(HOUR) })
    expect(isListedInCatalog(b, now)).toBe(true)
  })
})
