'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import css from './SignOutButton.module.scss'

export function SignOutButton() {
  const t = useTranslations('Admin')
  const router = useRouter()

  async function onClick() {
    await authClient.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button type="button" className={css.button} onClick={onClick}>
      {t('signOut')}
    </button>
  )
}
