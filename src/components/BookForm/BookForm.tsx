'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Controller,
  useForm,
  type FieldErrors,
  type Resolver,
} from 'react-hook-form'
import { useLocale, useTranslations } from 'next-intl'
import {
  CONDITIONS,
  parseBookForm,
  SUPPORTED_LANGUAGES,
  type BookFormErrors,
  type BookFormField,
  type BookFormResult,
  type BookFormValues,
} from '@/lib/book-form-schema'
import css from './BookForm.module.scss'

type BookFormProps = {
  // Genre keys to choose from. Their labels come from the messages file.
  genres: string[]
  action: (values: BookFormValues) => Promise<BookFormResult>
  initialValues?: BookFormValues
}

const NEW_BOOK: BookFormValues = {
  title: '',
  author: '',
  genres: [],
  language: 'cs',
  condition: 'used',
  conditionNote: '',
  description: '',
  price: '',
  isbn: '',
}

// The same check the server runs (parseBookForm), so the seller sees problems
// at once. The form still sends the raw values: the server checks again.
const resolver: Resolver<BookFormValues> = async (values) => {
  const result = parseBookForm(values)
  if (result.ok) return { values, errors: {} }

  const errors: FieldErrors<BookFormValues> = {}
  for (const [field, key] of Object.entries(result.errors)) {
    if (field === 'form') continue
    errors[field as BookFormField] = { type: 'validate', message: key } as never
  }
  return { values: {}, errors }
}

export function BookForm({ genres, action, initialValues }: BookFormProps) {
  const t = useTranslations('Admin.form')
  const tGenres = useTranslations('Genres')
  const locale = useLocale()
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BookFormValues>({
    defaultValues: initialValues ?? NEW_BOOK,
    resolver,
  })

  const languageNames = new Intl.DisplayNames(locale, { type: 'language' })

  async function onSubmit(values: BookFormValues) {
    setFormError(null)
    try {
      const result = await action(values)
      if (result.ok) {
        router.push('/admin')
        router.refresh()
        return
      }
      showServerErrors(result.errors)
    } catch {
      setFormError('saveFailed')
    }
  }

  function showServerErrors(serverErrors: BookFormErrors) {
    let focused = false
    for (const [field, key] of Object.entries(serverErrors)) {
      if (field === 'form') {
        setFormError(key)
        continue
      }
      setError(
        field as BookFormField,
        { type: 'server', message: key },
        { shouldFocus: !focused },
      )
      focused = true
    }
  }

  function describe(field: BookFormField) {
    const key = errors[field]?.message
    return {
      invalid: key ? (true as const) : undefined,
      describedBy: key ? `${field}-error` : undefined,
      message: key ? (
        <p id={`${field}-error`} className={css.error}>
          {t(`errors.${key as 'required'}`)}
        </p>
      ) : null,
    }
  }

  function textField(
    field: 'title' | 'author' | 'price' | 'isbn',
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
    mark = false,
  ) {
    const state = describe(field)
    return (
      <div className={css.field}>
        <label htmlFor={field} className={mark ? css.required : undefined}>
          {t(`fields.${field}`)}
        </label>
        <input
          id={field}
          aria-invalid={state.invalid}
          aria-describedby={state.describedBy}
          aria-required={mark || undefined}
          {...register(field)}
          {...extra}
        />
        {state.message}
      </div>
    )
  }

  const genresState = describe('genres')
  const conditionState = describe('condition')
  const languageState = describe('language')
  const noteState = describe('conditionNote')
  const descriptionState = describe('description')

  return (
    <form
      className={css.form}
      method="post"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <p className={css.note}>{t('requiredNote')}</p>

      {textField('title', { autoComplete: 'off' }, true)}
      {textField('author', { autoComplete: 'off' }, true)}
      {textField('price', { inputMode: 'decimal', autoComplete: 'off' }, true)}

      <fieldset
        className={css.group}
        aria-describedby={conditionState.describedBy}
      >
        <legend className={css.required}>{t('fields.condition')}</legend>
        {CONDITIONS.map((condition) => (
          <label key={condition} className={css.choice}>
            <input type="radio" value={condition} {...register('condition')} />
            {t(`conditions.${condition}`)}
          </label>
        ))}
        {conditionState.message}
      </fieldset>

      <div className={css.field}>
        <label htmlFor="language" className={css.required}>
          {t('fields.language')}
        </label>
        <select
          id="language"
          aria-invalid={languageState.invalid}
          aria-describedby={languageState.describedBy}
          {...register('language')}
        >
          {SUPPORTED_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageNames.of(code) ?? code}
            </option>
          ))}
        </select>
        {languageState.message}
      </div>

      <Controller
        control={control}
        name="genres"
        render={({ field }) => (
          <fieldset
            className={css.group}
            aria-describedby={genresState.describedBy}
          >
            <legend>{t('fields.genres')}</legend>
            {genres.map((key) => (
              <label key={key} className={css.choice}>
                <input
                  type="checkbox"
                  checked={field.value.includes(key)}
                  onChange={(event) =>
                    field.onChange(
                      event.target.checked
                        ? [...field.value, key]
                        : field.value.filter((value) => value !== key),
                    )
                  }
                />
                {tGenres(key as 'novel')}
              </label>
            ))}
            {genresState.message}
          </fieldset>
        )}
      />

      <div className={css.field}>
        <label htmlFor="conditionNote">{t('fields.conditionNote')}</label>
        <input
          id="conditionNote"
          aria-invalid={noteState.invalid}
          aria-describedby={noteState.describedBy}
          autoComplete="off"
          {...register('conditionNote')}
        />
        {noteState.message}
      </div>

      <div className={css.field}>
        <label htmlFor="description">{t('fields.description')}</label>
        <textarea
          id="description"
          rows={5}
          aria-invalid={descriptionState.invalid}
          aria-describedby={descriptionState.describedBy}
          {...register('description')}
        />
        {descriptionState.message}
      </div>

      {textField('isbn', { autoComplete: 'off' })}

      {formError && (
        <p role="alert" className={css.formError}>
          {t(`errors.${formError as 'saveFailed'}`)}
        </p>
      )}

      <button type="submit" className={css.submit} disabled={isSubmitting}>
        {isSubmitting ? t('saving') : t('save')}
      </button>
    </form>
  )
}
