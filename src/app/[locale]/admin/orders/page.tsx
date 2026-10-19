import { getTranslations } from 'next-intl/server'
import { AdminOrderRow } from '@/components/AdminOrderRow'
import { JobHealthNotice } from '@/components/JobHealthNotice'
import { env } from '@/config/env'
import { Link } from '@/i18n/navigation'
import { requireAdmin } from '@/lib/auth'
import { parseStageFilter, STAGE_FILTERS } from '@/server/admin/order-filter'
import { listAdminOrders } from '@/server/admin/order-list'
import type { JobHealth } from '@/server/job-health'
import { getJobHealth } from '@/server/job-heartbeat'
import css from '../page.module.scss'

export default async function AdminOrders({
  searchParams,
}: PageProps<'/[locale]/admin/orders'>) {
  // Layouts don't re-render on navigation, so every admin page checks for itself.
  const actor = await requireAdmin()
  const { status: rawStatus } = await searchParams
  const stage = parseStageFilter(rawStatus)
  const now = new Date()
  const { items, counts } = await listAdminOrders(actor, { stage, now })
  const t = await getTranslations('Admin.orders')
  // Without JOBS_SECRET the job endpoint is off (development, previews): there
  // is nothing to warn about.
  const jobHealth: JobHealth = env.JOBS_SECRET
    ? await getJobHealth(actor, now)
    : { status: 'ok' }

  return (
    <main className={css.main}>
      <header className={css.header}>
        <h1>{t('heading')}</h1>
        <div className={css.headerActions}>
          <Link href="/admin" className={css.secondary}>
            {t('backToBooks')}
          </Link>
        </div>
      </header>

      <JobHealthNotice health={jobHealth} />

      <nav aria-label={t('filterLabel')}>
        <ul className={css.filters}>
          {STAGE_FILTERS.map((filter) => (
            <li key={filter}>
              <Link
                href={
                  filter === 'all'
                    ? '/admin/orders'
                    : `/admin/orders?status=${filter}`
                }
                className={css.filter}
                aria-current={filter === stage ? 'page' : undefined}
              >
                {t(`filters.${filter}`)} ({counts[filter]})
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {items.length === 0 ? (
        <p className={css.empty}>{t('empty')}</p>
      ) : (
        <ul className={css.list}>
          {items.map((order) => (
            <li key={order.id}>
              <AdminOrderRow order={order} now={now} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
