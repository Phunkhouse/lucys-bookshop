'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import css from './LoginForm.module.scss'

type LoginFormProps = {
  // Where to go after signing in. The page passes a value already checked by safeNextPath.
  next: string
}

type ErrorKey = 'invalid' | 'tooMany' | 'generic'

export function LoginForm({ next }: LoginFormProps) {
  const t = useTranslations('Login')
  const router = useRouter()
  const [error, setError] = useState<ErrorKey | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      const { error: failure } = await authClient.signIn.email({
        email: String(form.get('email')),
        password: String(form.get('password')),
      })
      if (failure) {
        setError(failure.status === 429 ? 'tooMany' : 'invalid')
        return
      }
      router.push(next)
      router.refresh()
    } catch {
      setError('generic')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className={css.form} onSubmit={onSubmit}>
      <div className={css.field}>
        <label htmlFor="login-email">{t('email')}</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>
      <div className={css.field}>
        <label htmlFor="login-password">{t('password')}</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p role="alert" className={css.error}>
          {t(`errors.${error}`)}
        </p>
      )}
      <button type="submit" className={css.submit} disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
