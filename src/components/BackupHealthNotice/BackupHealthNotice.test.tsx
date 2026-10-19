import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { BackupHealthNotice } from './BackupHealthNotice'

describe('BackupHealthNotice', () => {
  it('shows nothing while backups are fine', () => {
    const { container } = renderWithIntl(
      <BackupHealthNotice health={{ status: 'ok' }} />,
    )

    expect(container.textContent).toBe('')
  })

  it('says that no backup ever ran, and what that means', () => {
    renderWithIntl(<BackupHealthNotice health={{ status: 'never' }} />)

    expect(screen.getByText('Záloha databáze nefunguje')).toBeTruthy()
    expect(screen.getByText(/ještě nikdy neproběhla/)).toBeTruthy()
    expect(screen.getByText(/nezálohují/)).toBeTruthy()
    expect(screen.getByText(/správce obchodu/)).toBeTruthy()
  })

  it('says when the last backup was, on the shop clock', () => {
    // 22:30 UTC is already the next day in Prague.
    renderWithIntl(
      <BackupHealthNotice
        health={{
          status: 'stale',
          lastRunAt: new Date('2026-10-18T22:30:00.000Z'),
        }}
      />,
    )

    expect(screen.getByText('Záloha databáze nefunguje')).toBeTruthy()
    expect(screen.getByText(/19\. října 2026.*0:30/)).toBeTruthy()
    expect(screen.getByText(/nezálohují/)).toBeTruthy()
  })
})
