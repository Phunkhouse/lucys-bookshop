import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/lib/render-with-intl'
import { LoginForm } from './LoginForm'

const { signInEmail, push, refresh } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { email: signInEmail } },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('E-mail'), {
    target: { value: 'lucy@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Heslo'), {
    target: { value: 'correct horse battery' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Přihlásit se' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginForm', () => {
  it('has labelled e-mail and password fields and a submit button', () => {
    renderWithIntl(<LoginForm next="/admin" />)

    expect(screen.getByLabelText('E-mail')).toBeTruthy()
    expect(screen.getByLabelText('Heslo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Přihlásit se' })).toBeTruthy()
  })

  it('signs in and goes to the requested page', async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null })
    renderWithIntl(<LoginForm next="/admin/books" />)

    fillAndSubmit()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/books'))
    expect(signInEmail).toHaveBeenCalledWith({
      email: 'lucy@example.com',
      password: 'correct horse battery',
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('shows one message for a wrong e-mail or password, and stays on the page', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 401 } })
    renderWithIntl(<LoginForm next="/admin" />)

    fillAndSubmit()

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Nesprávný e-mail nebo heslo.',
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('tells the user when the rate limit is hit', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 429 } })
    renderWithIntl(<LoginForm next="/admin" />)

    fillAndSubmit()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Příliš mnoho pokusů',
    )
  })

  it('shows a generic message when the request itself fails', async () => {
    signInEmail.mockRejectedValue(new Error('network'))
    renderWithIntl(<LoginForm next="/admin" />)

    fillAndSubmit()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Přihlášení se nepodařilo',
    )
  })
})
