'use client'

import { useId, useRef, useState } from 'react'
import css from './ConfirmButton.module.scss'

type ConfirmButtonProps = {
  // Opens the question.
  label: string
  title: string
  text: string
  confirmLabel: string
  pendingLabel: string
  cancelLabel: string
  // Runs on yes. The caller shows what went wrong: this only closes the question.
  onConfirm: () => Promise<void>
  disabled?: boolean
}

// A button that asks before it acts, in a native <dialog>. On a phone the
// question is a sheet at the bottom of the screen with large buttons.
export function ConfirmButton({
  label,
  title,
  text,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  onConfirm,
  disabled = false,
}: ConfirmButtonProps) {
  const headingId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState(false)

  function openDialog() {
    const dialog = dialogRef.current
    if (!dialog) return
    // A browser without showModal still shows it, just not as a modal.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    // The safe choice has the focus, so a stray Enter cannot confirm.
    cancelRef.current?.focus()
  }

  function closeDialog() {
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.close === 'function') dialog.close()
    else dialog.removeAttribute('open')
  }

  async function confirm() {
    if (pending) return
    setPending(true)
    try {
      await onConfirm()
    } catch {
      // The caller reports failures. Closing keeps the page usable.
    } finally {
      closeDialog()
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={css.open}
        disabled={disabled}
        onClick={openDialog}
      >
        {label}
      </button>
      <dialog
        ref={dialogRef}
        className={css.dialog}
        aria-labelledby={headingId}
        // Esc must not close it mid-request: the seller would lose the feedback.
        onCancel={(event) => {
          if (pending) event.preventDefault()
        }}
        onClick={(event) => {
          // A tap on the dimmed area (the dialog element itself) cancels.
          if (event.target === event.currentTarget && !pending) closeDialog()
        }}
      >
        <div className={css.sheet}>
          <h2 id={headingId} className={css.heading}>
            {title}
          </h2>
          <p>{text}</p>
          <div className={css.buttons}>
            <button
              ref={cancelRef}
              type="button"
              className={css.cancel}
              disabled={pending}
              onClick={closeDialog}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={css.confirm}
              disabled={pending}
              onClick={confirm}
            >
              {pending ? pendingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
