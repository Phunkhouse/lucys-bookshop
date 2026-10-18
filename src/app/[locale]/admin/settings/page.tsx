import { getTranslations } from 'next-intl/server'
import { SettingsForm } from '@/components/SettingsForm'
import { Link } from '@/i18n/navigation'
import { requireAdmin } from '@/lib/auth'
import { formatPriceInput } from '@/lib/price'
import { getShopSettings } from '@/server/settings'
import { updateSettingsAction } from './actions'
import css from '../books/form-page.module.scss'

export default async function SettingsPage() {
  await requireAdmin()
  const current = await getShopSettings()
  const t = await getTranslations('Admin.settings')

  return (
    <main className={css.main}>
      <Link href="/admin">{t('back')}</Link>
      <h1>{t('heading')}</h1>
      <p>{t('intro')}</p>
      <SettingsForm
        action={updateSettingsAction}
        initialValues={{
          zasilkovnaPrice:
            current.zasilkovnaPriceMinor === null
              ? ''
              : formatPriceInput(current.zasilkovnaPriceMinor),
          pickupInstructions: current.pickupInstructions,
        }}
      />
    </main>
  )
}
