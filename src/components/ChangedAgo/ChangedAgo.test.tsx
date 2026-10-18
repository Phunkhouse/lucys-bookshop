import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { ChangedAgo } from './ChangedAgo'

const now = new Date('2026-10-09T12:00:00.000Z')

describe('ChangedAgo', () => {
  it('says when the book was last changed, in words', () => {
    renderWithIntl(
      <ChangedAgo date={new Date('2026-10-04T12:00:00.000Z')} now={now} />,
    )

    expect(screen.getByText('Změněno před 5 dny')).toBeTruthy()
  })

  it('says Změněno dnes for a change within the last day', () => {
    renderWithIntl(<ChangedAgo date={now} now={now} />)

    expect(screen.getByText('Změněno dnes')).toBeTruthy()
  })

  it('keeps the exact date in a time element for assistive technology and hovering', () => {
    const date = new Date('2026-10-04T12:00:00.000Z')
    const { container } = renderWithIntl(<ChangedAgo date={date} now={now} />)

    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
      date.toISOString(),
    )
  })

  // The page renders on a server in another time zone than the shop's.
  it('shows the exact time on the shop clock, not the server clock', () => {
    // 22:30 UTC is already the next day in Prague.
    const date = new Date('2026-10-04T22:30:00.000Z')
    const { container } = renderWithIntl(<ChangedAgo date={date} now={now} />)

    expect(container.querySelector('time')?.getAttribute('title')).toMatch(
      /5\. 10\. 2026.*0:30/,
    )
  })
})
