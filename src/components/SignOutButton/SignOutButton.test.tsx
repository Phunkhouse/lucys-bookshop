import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { SignOutButton } from './SignOutButton'

const { signOut, push, refresh } = vi.hoisted(() => ({
  signOut: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({ authClient: { signOut } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

describe('SignOutButton', () => {
  it('signs out and returns to the login page', async () => {
    signOut.mockResolvedValue({ data: {}, error: null })
    renderWithIntl(<SignOutButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Odhlásit se' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'))
    expect(signOut).toHaveBeenCalled()
  })
})
