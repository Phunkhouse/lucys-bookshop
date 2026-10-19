'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ConfirmButton } from '@/components/ConfirmButton'
import type { OrderActionSet } from '@/server/admin/order-actions'
import type {
  CancelResult,
  CompleteResult,
  ExtendResult,
  MarkPaidResult,
  NoteResult,
  RefundResult,
  ShipResult,
  TrackingResult,
} from '@/server/admin/order-status'
import type { ConflictBook } from '@/server/order-conflicts'
import css from './OrderActions.module.scss'

type OrderActionsProps = {
  actions: OrderActionSet
  trackingNumber: string | null
  note: string | null
  markPaid: () => Promise<MarkPaidResult>
  cancel: () => Promise<CancelResult>
  refund: () => Promise<RefundResult>
  extend: () => Promise<ExtendResult>
  markShipped: (trackingNumber: string) => Promise<ShipResult>
  setTracking: (trackingNumber: string) => Promise<TrackingResult>
  complete: () => Promise<CompleteResult>
  setNote: (note: string) => Promise<NoteResult>
}

type Outcome = {
  outcome: string
  reason?: string
  books?: ConflictBook[]
}

type ErrorKey =
  | 'notPayable'
  | 'notCancellable'
  | 'notRefundable'
  | 'notExtendable'
  | 'notShippable'
  | 'notCompletable'
  | 'notShipped'
  | 'invalidTracking'
  | 'invalidNote'
  | 'notFound'
  | 'failed'

const errorKey: Record<string, ErrorKey> = {
  not_payable: 'notPayable',
  not_cancellable: 'notCancellable',
  not_refundable: 'notRefundable',
  not_extendable: 'notExtendable',
  not_shippable: 'notShippable',
  not_completable: 'notCompletable',
  not_shipped: 'notShipped',
  invalid_tracking: 'invalidTracking',
  invalid_note: 'invalidNote',
  not_found: 'notFound',
}

type Problem = { error: ErrorKey } | { conflict: ConflictBook[] }

// The seller's buttons for one order (spec 6.9). Which ones show is decided by
// the server (availableActions); the rules are enforced there again, so a
// stale page can only get a refusal, never a wrong change.
export function OrderActions({
  actions,
  trackingNumber,
  note,
  markPaid,
  cancel,
  refund,
  extend,
  markShipped,
  setTracking,
  complete,
  setNote,
}: OrderActionsProps) {
  const t = useTranslations('Admin.orders.actions')
  const tc = useTranslations('Admin.orders.detail.conflict')
  const router = useRouter()
  const trackingId = useId()
  const noteId = useId()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [tracking, setTrackingText] = useState(trackingNumber ?? '')
  const [noteText, setNoteText] = useState(note ?? '')
  const [noteSaved, setNoteSaved] = useState(false)
  const [trackingSaved, setTrackingSaved] = useState(false)

  // One action at a time. Whatever comes back, the page refreshes, so a stale
  // status corrects itself.
  async function run(call: () => Promise<Outcome>): Promise<Outcome | null> {
    setBusy(true)
    try {
      const result = await call()
      if (result.outcome === 'refused') {
        setProblem({ error: errorKey[result.reason ?? ''] ?? 'failed' })
      } else if (result.outcome === 'conflict') {
        setProblem({ conflict: result.books ?? [] })
      } else {
        setProblem(null)
      }
      router.refresh()
      return result
    } catch {
      setProblem({ error: 'failed' })
      return null
    } finally {
      setBusy(false)
    }
  }

  const confirmed = (
    key: 'markPaid' | 'cancel' | 'refund',
    call: () => Promise<Outcome>,
  ) => (
    <ConfirmButton
      label={t(`${key}.button`)}
      title={t(`${key}.title`)}
      text={t(`${key}.text`)}
      confirmLabel={t(`${key}.confirm`)}
      pendingLabel={t('pending')}
      cancelLabel={t('back')}
      disabled={busy}
      onConfirm={async () => {
        await run(call)
      }}
    />
  )

  async function submitTracking(
    event: React.FormEvent,
    call: (value: string) => Promise<Outcome>,
  ) {
    event.preventDefault()
    const value = tracking.trim()
    if (value === '') {
      setProblem({ error: 'invalidTracking' })
      return
    }
    const result = await run(() => call(value))
    // Shipping moves the order on, so only a correction needs the confirmation.
    setTrackingSaved(
      result?.outcome === 'saved' || result?.outcome === 'unchanged',
    )
  }

  async function submitNote(event: React.FormEvent) {
    event.preventDefault()
    const result = await run(() => setNote(noteText.trim()))
    setNoteSaved(result?.outcome === 'saved')
  }

  const trackingField = (
    <>
      <label htmlFor={trackingId}>{t('tracking.label')}</label>
      <input
        id={trackingId}
        className={css.input}
        value={tracking}
        maxLength={100}
        onChange={(event) => {
          setTrackingText(event.target.value)
          setTrackingSaved(false)
        }}
      />
    </>
  )

  return (
    <section className={css.section} aria-labelledby="order-actions">
      <h2 id="order-actions">{t('heading')}</h2>

      {problem && 'error' in problem && (
        <p role="alert" className={css.problem}>
          {t(`errors.${problem.error}`)}
        </p>
      )}
      {problem && 'conflict' in problem && (
        <div role="alert" className={css.problem}>
          <p>{t('conflict')}</p>
          <ul>
            {problem.conflict.map((book) => (
              <li key={book.id}>
                {book.title} – {tc(book.reason)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={css.buttons}>
        {actions.markPaid && confirmed('markPaid', markPaid)}
        {actions.extend && (
          <button
            type="button"
            className={css.button}
            disabled={busy}
            onClick={() => void run(extend)}
          >
            {t('extend')}
          </button>
        )}
        {actions.complete && (
          <button
            type="button"
            className={css.button}
            disabled={busy}
            onClick={() => void run(complete)}
          >
            {t('complete')}
          </button>
        )}
        {actions.cancel && confirmed('cancel', cancel)}
        {actions.refund && confirmed('refund', refund)}
      </div>

      {actions.ship && (
        <form
          className={css.form}
          noValidate
          onSubmit={(event) => submitTracking(event, markShipped)}
        >
          {trackingField}
          <button type="submit" className={css.button} disabled={busy}>
            {t('ship')}
          </button>
        </form>
      )}

      {actions.fixTracking && (
        <form
          className={css.form}
          noValidate
          onSubmit={(event) => submitTracking(event, setTracking)}
        >
          {trackingField}
          <button type="submit" className={css.button} disabled={busy}>
            {t('tracking.save')}
          </button>
          {trackingSaved && <p role="status">{t('tracking.saved')}</p>}
        </form>
      )}

      <form className={css.form} onSubmit={submitNote}>
        <label htmlFor={noteId}>{t('note.label')}</label>
        <textarea
          id={noteId}
          className={css.input}
          rows={3}
          maxLength={2000}
          value={noteText}
          onChange={(event) => {
            setNoteText(event.target.value)
            setNoteSaved(false)
          }}
        />
        <button type="submit" className={css.button} disabled={busy}>
          {t('note.save')}
        </button>
        {noteSaved && <p role="status">{t('note.saved')}</p>}
      </form>
    </section>
  )
}
