import { describe, expect, it } from 'vitest'
import { paymentInstructions } from './payment-instructions'
import { TEST_ACCOUNT_DISPLAY, TEST_IBAN } from './test-iban'

const IBAN = TEST_IBAN
const order = {
  number: 20260042,
  totalMinor: 66700,
  paymentMethod: 'bank_transfer' as const,
  stage: 'awaiting_payment' as const,
}

describe('paymentInstructions', () => {
  it('gives the SPAYD string and the details to type in', () => {
    expect(paymentInstructions(order, IBAN)).toEqual({
      status: 'ready',
      spayd: `SPD*1.0*ACC:${IBAN}*AM:667.00*CC:CZK*X-VS:20260042*MSG:OBJEDNAVKA 20260042`,
      iban: IBAN,
      account: TEST_ACCOUNT_DISPLAY,
      amountMinor: 66700,
      variableSymbol: '20260042',
    })
  })

  it('says so when the seller account is not set up, instead of failing', () => {
    expect(paymentInstructions(order, undefined)).toEqual({
      status: 'not_configured',
    })
  })

  it('has no QR for an order with nothing to pay, but still shows the details', () => {
    expect(
      paymentInstructions({ ...order, totalMinor: 0 }, IBAN),
    ).toMatchObject({ status: 'ready', spayd: null, amountMinor: 0 })
  })

  it.each([
    ['cash', { paymentMethod: 'cash_on_pickup' as const }],
    ['paid', { stage: 'paid' as const }],
    ['expired', { stage: 'expired' as const }],
    ['cancelled', { stage: 'cancelled' as const }],
    ['refunded', { stage: 'refunded' as const }],
  ])('gives nothing for a %s order', (_label, change) => {
    expect(paymentInstructions({ ...order, ...change }, IBAN)).toBeNull()
  })
})
