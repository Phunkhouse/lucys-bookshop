'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import css from './DeleteBookButton.module.scss'

type DeleteReason =
  'not_hidden' | 'reserved' | 'sold' | 'has_orders' | 'not_found'

type DeleteBookButtonProps = {
  status: 'available' | 'reserved' | 'sold' | 'hidden'
  title: string
  deleteBook: () => Promise<
    { outcome: 'deleted' } | { outcome: 'refused'; reason: DeleteReason }
  >
}

type ErrorKey =
  'notHidden' | 'reserved' | 'sold' | 'hasOrders' | 'notFound' | 'failed'

const errorKey: Record<DeleteReason, ErrorKey> = {
  not_hidden: 'notHidden',
  reserved: 'reserved',
  sold: 'sold',
  has_orders: 'hasOrders',
  not_found: 'notFound',
}

// Delete a hidden book, after a question in a native <dialog>. On a phone the
// question is a sheet at the bottom of the screen with large buttons.
export function DeleteBookButton({
  status,
  title,
  deleteBook,
}: DeleteBookButtonProps) {
  const t = useTranslations('Admin.books.delete')
  const router = useRouter()
  const headingId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [pending, setPending] = useState(false)

  function openDialog() {
    const dialog = dialogRef.current
    if (!dialog) return
    setError(null)
    // A browser without showModal still shows it, just not as a modal.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    // The safe choice has the focus, so a stray Enter cannot delete.
    cancelRef.current?.focus()
  }

  function closeDialog() {
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.close === 'function') dialog.close()
    else dialog.removeAttribute('open')
  }

  async function confirmDelete() {
    setPending(true)
    try {
      const result = await deleteBook()
      closeDialog()
      if (result.outcome === 'refused') setError(errorKey[result.reason])
      // Refresh in every case, so the list shows what is really there.
      router.refresh()
    } catch {
      closeDialog()
      setError('failed')
    } finally {
      setPending(false)
    }
  }

  // Once the refreshed page shows the book as something else, the button is
  // gone but the explanation stays.
  if (status !== 'hidden' && !error) return null

  return (
    <div className={css.wrapper}>
      {status === 'hidden' && (
        <>
          <button type="button" className={css.open} onClick={openDialog}>
            {t('button')}
          </button>
          <dialog
            ref={dialogRef}
            className={css.dialog}
            aria-labelledby={headingId}
            onClick={(event) => {
              // A tap on the dimmed area (the dialog element itself) cancels.
              if (event.target === event.currentTarget && !pending)
                closeDialog()
            }}
          >
            <div className={css.sheet}>
              <h2 id={headingId} className={css.heading}>
                {t('confirmTitle')}
              </h2>
              <p>{t('confirmText', { title })}</p>
              <div className={css.buttons}>
                <button
                  ref={cancelRef}
                  type="button"
                  className={css.cancel}
                  disabled={pending}
                  onClick={closeDialog}
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  className={css.confirm}
                  disabled={pending}
                  onClick={confirmDelete}
                >
                  {pending ? t('deleting') : t('confirm')}
                </button>
              </div>
            </div>
          </dialog>
        </>
      )}
      {error && (
        <p role="alert" className={css.error}>
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  )
}
