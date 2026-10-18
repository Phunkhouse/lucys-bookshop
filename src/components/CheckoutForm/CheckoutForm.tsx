'use client'

import { useEffect, useState } from 'react'
import {
  useForm,
  useWatch,
  type FieldErrors,
  type Resolver,
} from 'react-hook-form'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import type { CartInput } from '@/lib/cart-schema'
import { checkoutInputSchema } from '@/lib/checkout-schema'
import { useCart } from '@/lib/use-cart'
import { useMoney } from '@/lib/use-money'
import type { CartValidation } from '@/server/cart'
import type { CartLine } from '@/server/cart-rules'
import type { CheckoutResult } from '@/server/checkout'
import css from './CheckoutForm.module.scss'

type ValidateResult = { ok: true; validation: CartValidation } | { ok: false }

type CheckoutFormProps = {
  // The server's answer for a cart (spec 6.3), the same one the cart page asks.
  validate: (items: CartInput) => Promise<ValidateResult>
  // Places the order. Gets plain data and answers with a reason, not an error.
  submit: (input: unknown) => Promise<CheckoutResult>
  // From the seller's settings. Null: Zásilkovna is not offered yet.
  zasilkovnaPriceMinor: number | null
  pickupInstructions: string
}

type FormValues = {
  name: string
  email: string
  phone: string
  shippingMethod: 'pickup' | 'zasilkovna'
  paymentMethod: 'bank_transfer' | 'cash_on_pickup'
  shippingDetails: string
  website: string
  acceptTerms: boolean
  acceptPrivacy: boolean
}

type FieldName =
  | 'name'
  | 'email'
  | 'phone'
  | 'shippingDetails'
  | 'acceptTerms'
  | 'acceptPrivacy'
const FIELDS: FieldName[] = [
  'name',
  'email',
  'phone',
  'shippingDetails',
  'acceptTerms',
  'acceptPrivacy',
]

const DEFAULTS: FormValues = {
  name: '',
  email: '',
  phone: '',
  shippingMethod: 'pickup',
  paymentMethod: 'bank_transfer',
  shippingDetails: '',
  website: '',
  acceptTerms: false,
  acceptPrivacy: false,
}

// What the server said about one exact cart; `key` says which cart that was.
type Answer =
  | { key: string; kind: 'ok'; validation: CartValidation }
  | { key: string; kind: 'failed' }

type Failure =
  | 'unavailable'
  | 'price_changed'
  | 'rate_limited'
  | 'shipping_unavailable'
  | 'invalid'
  | 'generic'

type Buyable = Extract<CartLine, { kind: 'ok' }>

export function CheckoutForm({
  validate,
  submit,
  zasilkovnaPriceMinor,
  pickupInstructions,
}: CheckoutFormProps) {
  const t = useTranslations('Checkout')
  const money = useMoney()
  const router = useRouter()
  const { items, clear } = useCart()
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [failure, setFailure] = useState<{ kind: Failure; minutes?: number }>()
  const [placed, setPlaced] = useState(false)
  // One key per checkout attempt: pressing again after a lost answer returns
  // the order the first press made instead of a second one.
  const [checkoutKey] = useState(() => crypto.randomUUID())

  const cartKey = JSON.stringify(items)

  useEffect(() => {
    if (items.length === 0) return
    let ignore = false
    validate(items).then(
      (result) => {
        if (ignore) return
        setAnswer(
          result.ok
            ? { key: cartKey, kind: 'ok', validation: result.validation }
            : { key: cartKey, kind: 'failed' },
        )
      },
      () => {
        if (!ignore) setAnswer({ key: cartKey, kind: 'failed' })
      },
    )
    return () => {
      ignore = true
    }
    // `validate` does not change; the cart and the retry counter do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, attempt])

  // The same check the server runs, so the buyer sees problems at once. The
  // server checks again.
  const resolver: Resolver<FormValues> = async (values) => {
    const result = checkoutInputSchema.safeParse({
      ...values,
      cart: items,
      checkoutKey,
    })
    if (result.success) return { values, errors: {} }
    const errors: FieldErrors<FormValues> = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as FieldName
      if (FIELDS.includes(field) && !errors[field]) {
        errors[field] = { type: 'validate', message: field } as never
      }
    }
    return { values: {}, errors }
  }

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: DEFAULTS, resolver })
  const shippingMethod = useWatch({ control, name: 'shippingMethod' })

  const current = answer?.key === cartKey ? answer : null
  const lines = current?.kind === 'ok' ? current.validation.lines : []
  const allOk = lines.length > 0 && lines.every((line) => line.kind === 'ok')
  const changed = current?.kind === 'ok' && !allOk
  const canSubmit = current?.kind === 'ok' && allOk

  const shippingMinor =
    shippingMethod === 'zasilkovna' ? zasilkovnaPriceMinor : 0

  async function onSubmit(values: FormValues) {
    setFailure(undefined)
    try {
      const result = await submit({
        ...values,
        shippingDetails:
          values.shippingMethod === 'zasilkovna' ? values.shippingDetails : '',
        cart: items,
        checkoutKey,
      })
      if (result.ok) {
        setPlaced(true)
        clear()
        router.push(`/order/${result.publicToken}`)
        return
      }
      if (result.reason === 'rate_limited') {
        setFailure({
          kind: 'rate_limited',
          minutes: Math.max(1, Math.ceil(result.retryAfterMs / 60_000)),
        })
        return
      }
      setFailure({ kind: result.reason })
      // The cart is no longer what the buyer saw: look at it again.
      if (
        result.reason === 'unavailable' ||
        result.reason === 'price_changed'
      ) {
        setAttempt((n) => n + 1)
      }
    } catch {
      setFailure({ kind: 'generic' })
    }
  }

  function field(name: FieldName) {
    const key = errors[name]?.message
    return {
      invalid: key ? (true as const) : undefined,
      describedBy: key ? `checkout-${name}-error` : undefined,
      message: key ? (
        <p id={`checkout-${name}-error`} className={css.error}>
          {t(`errors.${name}`)}
        </p>
      ) : null,
    }
  }

  if (placed) {
    return (
      <>
        <h1>{t('title')}</h1>
        <p role="status">{t('placed')}</p>
      </>
    )
  }

  if (items.length === 0) {
    return (
      <>
        <h1>{t('title')}</h1>
        <div className={css.empty}>
          <p className={css.emptyTitle}>{t('empty.title')}</p>
          <p>
            <Link href="/">{t('empty.browse')}</Link>
          </p>
        </div>
      </>
    )
  }

  const nameField = field('name')
  const emailField = field('email')
  const phoneField = field('phone')
  const pointField = field('shippingDetails')
  const termsField = field('acceptTerms')
  const privacyField = field('acceptPrivacy')
  const busy = isSubmitting

  return (
    <>
      <h1>{t('title')}</h1>

      {current?.kind === 'failed' && (
        <div className={css.notice} role="alert">
          <p>{t('validateFailed')}</p>
          <button
            type="button"
            className={css.button}
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('retry')}
          </button>
        </div>
      )}

      {changed && (
        <div className={css.notice} role="alert">
          <p>{t('cartChanged')}</p>
          <Link href="/cart" className={css.button}>
            {t('toCart')}
          </Link>
        </div>
      )}

      {current === null && <p role="status">{t('loading')}</p>}

      {allOk && (
        <section className={css.summary} aria-labelledby="checkout-summary">
          <h2 id="checkout-summary">{t('summary.heading')}</h2>
          <ul className={css.lines}>
            {(lines as Buyable[]).map((line) => (
              <li key={line.shortId} className={css.line}>
                <span>
                  <span className={css.title}>{line.title}</span>
                  <span className={css.author}>{line.author}</span>
                </span>
                <span>{money(line.priceMinor, line.currency)}</span>
              </li>
            ))}
          </ul>
          {current?.kind === 'ok' && (
            <dl className={css.totals}>
              <div>
                <dt>{t('summary.books')}</dt>
                <dd>
                  {money(
                    current.validation.subtotalMinor,
                    current.validation.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('summary.shipping')}</dt>
                <dd>
                  {shippingMinor === 0 || shippingMinor === null
                    ? t('summary.shippingFree')
                    : money(shippingMinor, current.validation.currency)}
                </dd>
              </div>
              <div className={css.total}>
                <dt>{t('summary.total')}</dt>
                <dd>
                  {money(
                    current.validation.subtotalMinor + (shippingMinor ?? 0),
                    current.validation.currency,
                  )}
                </dd>
              </div>
            </dl>
          )}
        </section>
      )}

      <form
        className={css.form}
        method="post"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <fieldset className={css.group}>
          <legend>{t('contact.heading')}</legend>
          <div className={css.field}>
            <label htmlFor="checkout-name">{t('contact.name')}</label>
            <input
              id="checkout-name"
              autoComplete="name"
              aria-invalid={nameField.invalid}
              aria-describedby={nameField.describedBy}
              {...register('name')}
            />
            {nameField.message}
          </div>
          <div className={css.field}>
            <label htmlFor="checkout-email">{t('contact.email')}</label>
            <input
              id="checkout-email"
              type="email"
              autoComplete="email"
              aria-invalid={emailField.invalid}
              aria-describedby={emailField.describedBy}
              {...register('email')}
            />
            {emailField.message}
          </div>
          <div className={css.field}>
            <label htmlFor="checkout-phone">{t('contact.phone')}</label>
            <input
              id="checkout-phone"
              type="tel"
              autoComplete="tel"
              aria-invalid={phoneField.invalid}
              aria-describedby={phoneField.describedBy}
              {...register('phone')}
            />
            {phoneField.message}
          </div>
          <p className={css.hint}>{t('contact.hint')}</p>
        </fieldset>

        <fieldset className={css.group}>
          <legend>{t('shipping.heading')}</legend>
          <label className={css.choice}>
            <input
              type="radio"
              value="pickup"
              {...register('shippingMethod')}
            />
            {t('shipping.pickup')}
          </label>
          {zasilkovnaPriceMinor !== null && (
            <label className={css.choice}>
              <input
                type="radio"
                value="zasilkovna"
                {...register('shippingMethod', {
                  // Cash needs a handover in person.
                  onChange: (event) => {
                    if (event.target.value === 'zasilkovna') {
                      setValue('paymentMethod', 'bank_transfer')
                    }
                  },
                })}
              />
              {t('shipping.zasilkovna', {
                price: money(zasilkovnaPriceMinor, 'CZK'),
              })}
            </label>
          )}
          {shippingMethod === 'zasilkovna' ? (
            <div className={css.field}>
              <label htmlFor="checkout-point">
                {t('shipping.pickupPoint')}
              </label>
              <input
                id="checkout-point"
                aria-invalid={pointField.invalid}
                aria-describedby={[
                  pointField.describedBy,
                  'checkout-point-hint',
                ]
                  .filter(Boolean)
                  .join(' ')}
                {...register('shippingDetails')}
              />
              <p id="checkout-point-hint" className={css.hint}>
                {t('shipping.pickupPointHint')}
              </p>
              {pointField.message}
            </div>
          ) : (
            pickupInstructions !== '' && (
              <div className={css.instructions}>
                <p className={css.instructionsTitle}>
                  {t('shipping.pickupInstructions')}
                </p>
                <p>{pickupInstructions}</p>
              </div>
            )
          )}
        </fieldset>

        <fieldset className={css.group}>
          <legend>{t('payment.heading')}</legend>
          <label className={css.choice}>
            <input
              type="radio"
              value="bank_transfer"
              {...register('paymentMethod')}
            />
            {t('payment.bank')}
          </label>
          {shippingMethod === 'pickup' && (
            <label className={css.choice}>
              <input
                type="radio"
                value="cash_on_pickup"
                {...register('paymentMethod')}
              />
              {t('payment.cash')}
            </label>
          )}
        </fieldset>

        {/* Honeypot: people never see it, bots fill every field. */}
        <div className={css.trap} aria-hidden="true">
          <label>
            {t('trap')}
            <input tabIndex={-1} autoComplete="off" {...register('website')} />
          </label>
        </div>

        <div className={css.consents}>
          <div className={css.field}>
            <label className={css.choice}>
              <input
                type="checkbox"
                aria-invalid={termsField.invalid}
                aria-describedby={termsField.describedBy}
                {...register('acceptTerms')}
              />
              {t('consent.terms')}
            </label>
            {termsField.message}
          </div>
          <div className={css.field}>
            <label className={css.choice}>
              <input
                type="checkbox"
                aria-invalid={privacyField.invalid}
                aria-describedby={privacyField.describedBy}
                {...register('acceptPrivacy')}
              />
              {t('consent.privacy')}
            </label>
            {privacyField.message}
          </div>
        </div>

        {failure && (
          <p role="alert" className={css.failure}>
            {t(`failures.${failure.kind}`, { minutes: failure.minutes ?? 0 })}
          </p>
        )}

        <p className={css.hint}>{t('reserveNote')}</p>
        <button
          type="submit"
          className={css.submit}
          disabled={busy || !canSubmit}
        >
          {busy ? t('submitting') : t('submit')}
        </button>
      </form>
    </>
  )
}
