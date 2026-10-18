import { describe, expect, it } from 'vitest'
import { conflictingBooks, type HeldBook } from './order-conflicts'

const now = new Date('2026-10-18T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)
const ORDER = 'order-1'

function book(overrides: Partial<HeldBook> = {}): HeldBook {
  return {
    id: 'book-1',
    title: 'Babička',
    status: 'reserved',
    reservedUntil: at(HOUR),
    soldAt: null,
    reservedByOrderId: ORDER,
    ...overrides,
  }
}

describe('conflictingBooks', () => {
  it('has no conflict while the order still holds its books', () => {
    expect(conflictingBooks(ORDER, [book()], now)).toEqual([])
  })

  // Nobody took it, so a late payment sells it (spec 6.4).
  it('has no conflict for a held book past its deadline', () => {
    expect(
      conflictingBooks(ORDER, [book({ reservedUntil: at(-10 * HOUR) })], now),
    ).toEqual([])
  })

  it('has no conflict for a book that is free again', () => {
    expect(
      conflictingBooks(
        ORDER,
        [
          book({
            status: 'available',
            reservedUntil: null,
            reservedByOrderId: null,
          }),
        ],
        now,
      ),
    ).toEqual([])
  })

  it("has no conflict for another order's lapsed reservation", () => {
    expect(
      conflictingBooks(
        ORDER,
        [book({ reservedUntil: at(-HOUR), reservedByOrderId: 'order-2' })],
        now,
      ),
    ).toEqual([])
  })

  it("reports another order's live reservation", () => {
    expect(
      conflictingBooks(
        ORDER,
        [book({ reservedUntil: at(HOUR), reservedByOrderId: 'order-2' })],
        now,
      ),
    ).toEqual([{ id: 'book-1', title: 'Babička', reason: 'reserved' }])
  })

  it('reports a book sold to someone else', () => {
    expect(
      conflictingBooks(
        ORDER,
        [
          book({
            status: 'sold',
            reservedUntil: null,
            soldAt: at(-HOUR),
            reservedByOrderId: 'order-2',
          }),
        ],
        now,
      ),
    ).toEqual([{ id: 'book-1', title: 'Babička', reason: 'sold' }])
  })

  it('reports a hidden book', () => {
    expect(
      conflictingBooks(
        ORDER,
        [
          book({
            status: 'hidden',
            reservedUntil: null,
            reservedByOrderId: null,
          }),
        ],
        now,
      ),
    ).toEqual([{ id: 'book-1', title: 'Babička', reason: 'hidden' }])
  })

  it('lists only the books in conflict, in the order given', () => {
    const result = conflictingBooks(
      ORDER,
      [
        book({ id: 'a', title: 'A' }),
        book({ id: 'b', title: 'B', reservedByOrderId: 'order-2' }),
        book({ id: 'c', title: 'C', status: 'hidden', reservedUntil: null }),
      ],
      now,
    )

    expect(result.map((b) => b.id)).toEqual(['b', 'c'])
  })
})
