import { getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/LoginForm'
import { safeNextPath } from '@/lib/admin-gate'
import { auth } from '@/lib/auth'
import css from './page.module.scss'

export default async function LoginPage({
  searchParams,
}: PageProps<'/[locale]/login'>) {
  const { next } = await searchParams
  const target = safeNextPath(typeof next === 'string' ? next : null)

  // Already signed in: skip the form.
  if (await auth.api.getSession({ headers: await headers() })) redirect(target)

  const t = await getTranslations('Login')
  return (
    <main className={css.main}>
      <h1>{t('title')}</h1>
      <LoginForm next={target} />
    </main>
  )
}
