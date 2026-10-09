import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { BookStatusToggle } from './BookStatusToggle'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BookStatusToggle', () => {
  it('offers Skrýt for an available book', () => {
    renderWithIntl(<BookStatusToggle status="available" setHidden={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Skrýt' })).toBeTruthy()
  })

  it('offers Zobrazit for a hidden book', () => {
    renderWithIntl(<BookStatusToggle status="hidden" setHidden={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Zobrazit' })).toBeTruthy()
  })

  it.each(['reserved', 'sold'] as const)(
    'offers no button for a %s book',
    (status) => {
      renderWithIntl(<BookStatusToggle status={status} setHidden={vi.fn()} />)

      expect(screen.queryByRole('button')).toBeNull()
    },
  )

  it('hides the book and refreshes the list', async () => {
    const setHidden = vi.fn().mockResolvedValue({ outcome: 'changed' })
    renderWithIntl(
      <BookStatusToggle status="available" setHidden={setHidden} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Skrýt' }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(setHidden).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('unhides the book', async () => {
    const setHidden = vi.fn().mockResolvedValue({ outcome: 'changed' })
    renderWithIntl(<BookStatusToggle status="hidden" setHidden={setHidden} />)

    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit' }))

    await waitFor(() => expect(setHidden).toHaveBeenCalledWith(false))
  })

  it('tells the seller when the book was reserved in the meantime', async () => {
    const setHidden = vi
      .fn()
      .mockResolvedValue({ outcome: 'refused', reason: 'reserved' })
    renderWithIntl(
      <BookStatusToggle status="available" setHidden={setHidden} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Skrýt' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Mezitím byla kniha rezervována, skrýt ji nejde.',
    )
    // The list is refreshed anyway, so the page stops showing a stale status.
    expect(refresh).toHaveBeenCalled()
  })

  it('tells the seller when the book was sold in the meantime', async () => {
    const setHidden = vi
      .fn()
      .mockResolvedValue({ outcome: 'refused', reason: 'sold' })
    renderWithIntl(
      <BookStatusToggle status="available" setHidden={setHidden} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Skrýt' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Kniha je mezitím prodaná, skrýt ji nejde.',
    )
  })

  it('tells the seller when the book no longer exists', async () => {
    const setHidden = vi
      .fn()
      .mockResolvedValue({ outcome: 'refused', reason: 'not_found' })
    renderWithIntl(
      <BookStatusToggle status="available" setHidden={setHidden} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Skrýt' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Tuto knihu se nepodařilo najít.',
    )
  })
})
