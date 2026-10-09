import { getTranslations } from 'next-intl/server'
import { SignOutButton } from '@/components/SignOutButton'
import { requireAdmin } from '@/lib/auth'
import css from './page.module.scss'

export default async function AdminHome() {
  // Layouts don't re-render on navigation, so every admin page checks for itself.
  const actor = await requireAdmin()
  const t = await getTranslations('Admin')

  return (
    <main className={css.main}>
      <h1>{t('heading')}</h1>
      <p>{t('signedInAs', { email: actor.email })}</p>
      <SignOutButton />
    </main>
  )
}
