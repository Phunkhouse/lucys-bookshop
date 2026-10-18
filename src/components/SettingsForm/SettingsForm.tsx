'use client'

import { useState } from 'react'
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { useTranslations } from 'next-intl'
import {
  parseSettingsForm,
  type SettingsFormField,
  type SettingsFormResult,
  type SettingsFormValues,
} from '@/lib/settings-form-schema'
import css from './SettingsForm.module.scss'

type SettingsFormProps = {
  action: (values: SettingsFormValues) => Promise<SettingsFormResult>
  initialValues: SettingsFormValues
}

// The same check the server runs, so the seller sees problems at once. The
// form still sends the raw values: the server checks again.
const resolver: Resolver<SettingsFormValues> = async (values) => {
  const result = parseSettingsForm(values)
  if (result.ok) return { values, errors: {} }
  const errors: FieldErrors<SettingsFormValues> = {}
  for (const [field, key] of Object.entries(result.errors)) {
    if (field === 'form') continue
    errors[field as SettingsFormField] = {
      type: 'validate',
      message: key,
    } as never
  }
  return { values: {}, errors }
}

export function SettingsForm({ action, initialValues }: SettingsFormProps) {
  const t = useTranslations('Admin.settings')
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    defaultValues: initialValues,
    resolver,
  })

  async function onSubmit(values: SettingsFormValues) {
    setSaved(false)
    setFormError(null)
    try {
      const result = await action(values)
      if (result.ok) {
        setSaved(true)
        return
      }
      let focused = false
      for (const [field, key] of Object.entries(result.errors)) {
        if (field === 'form') {
          setFormError(key)
          continue
        }
        setError(
          field as SettingsFormField,
          { type: 'server', message: key },
          { shouldFocus: !focused },
        )
        focused = true
      }
    } catch {
      setFormError('saveFailed')
    }
  }

  function describe(field: SettingsFormField) {
    const key = errors[field]?.message
    const hintId = `${field}-hint`
    return {
      invalid: key ? (true as const) : undefined,
      describedBy: key ? `${field}-error ${hintId}` : hintId,
      hintId,
      message: key ? (
        <p id={`${field}-error`} className={css.error}>
          {t(`errors.${key as 'invalid'}`)}
        </p>
      ) : null,
    }
  }

  const price = describe('zasilkovnaPrice')
  const pickup = describe('pickupInstructions')

  return (
    <form
      className={css.form}
      method="post"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className={css.field}>
        <label htmlFor="zasilkovnaPrice">{t('fields.zasilkovnaPrice')}</label>
        <p id={price.hintId} className={css.hint}>
          {t('hints.zasilkovnaPrice')}
        </p>
        <input
          id="zasilkovnaPrice"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={price.invalid}
          aria-describedby={price.describedBy}
          {...register('zasilkovnaPrice')}
        />
        {price.message}
      </div>
      <div className={css.field}>
        <label htmlFor="pickupInstructions">
          {t('fields.pickupInstructions')}
        </label>
        <p id={pickup.hintId} className={css.hint}>
          {t('hints.pickupInstructions')}
        </p>
        <textarea
          id="pickupInstructions"
          rows={5}
          aria-invalid={pickup.invalid}
          aria-describedby={pickup.describedBy}
          {...register('pickupInstructions')}
        />
        {pickup.message}
      </div>
      {formError && (
        <p role="alert" className={css.formError}>
          {t(`errors.${formError as 'saveFailed'}`)}
        </p>
      )}
      {saved && (
        <p role="status" className={css.saved}>
          {t('saved')}
        </p>
      )}
      <button type="submit" className={css.submit} disabled={isSubmitting}>
        {isSubmitting ? t('saving') : t('save')}
      </button>
    </form>
  )
}
