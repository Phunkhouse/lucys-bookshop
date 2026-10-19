import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { JobHealthNotice } from './JobHealthNotice'

describe('JobHealthNotice', () => {
  it('shows nothing while the job is fine', () => {
    const { container } = renderWithIntl(
      <JobHealthNotice health={{ status: 'ok' }} />,
    )

    expect(container.textContent).toBe('')
  })

  it('says that the job has never run, and what does not work meanwhile', () => {
    renderWithIntl(<JobHealthNotice health={{ status: 'never' }} />)

    expect(screen.getByText('Hodinová kontrola nefunguje')).toBeTruthy()
    expect(screen.getByText(/ještě nikdy neběžela/)).toBeTruthy()
    expect(screen.getByText(/končící rezervace/)).toBeTruthy()
    expect(screen.getByText(/správce obchodu/)).toBeTruthy()
  })

  it('says since when the job has been silent, on the shop clock', () => {
    // 22:30 UTC is already the next day in Prague.
    renderWithIntl(
      <JobHealthNotice
        health={{
          status: 'stale',
          lastRunAt: new Date('2026-10-18T22:30:00.000Z'),
        }}
      />,
    )

    expect(screen.getByText('Hodinová kontrola nefunguje')).toBeTruthy()
    expect(screen.getByText(/19\. října 2026.*0:30/)).toBeTruthy()
    expect(screen.getByText(/končící rezervace/)).toBeTruthy()
  })
})
