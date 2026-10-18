import { describe, expect, it } from 'vitest'
import { parseSettingsForm } from './settings-form-schema'

const valid = { zasilkovnaPrice: '89', pickupInstructions: 'Na Příkopě 1' }

describe('parseSettingsForm', () => {
  it('turns the typed price into minor units', () => {
    expect(parseSettingsForm({ ...valid, zasilkovnaPrice: '89,50' })).toEqual({
      ok: true,
      data: { zasilkovnaPriceMinor: 8950, pickupInstructions: 'Na Příkopě 1' },
    })
  })

  it('treats an empty or blank price as "not set"', () => {
    for (const zasilkovnaPrice of ['', '   ']) {
      const result = parseSettingsForm({ ...valid, zasilkovnaPrice })
      expect(result).toMatchObject({
        ok: true,
        data: { zasilkovnaPriceMinor: null },
      })
    }
  })

  it.each([
    ['-5', 'priceInvalid'],
    ['abc', 'priceInvalid'],
    ['1,234', 'priceDecimals'],
    ['0', 'pricePositive'],
    ['100001', 'priceTooHigh'],
    ['99999999999999999999', 'priceTooHigh'],
  ])('rejects the price %j as %s', (zasilkovnaPrice, key) => {
    expect(parseSettingsForm({ ...valid, zasilkovnaPrice })).toEqual({
      ok: false,
      errors: { zasilkovnaPrice: key },
    })
  })

  it('trims the pickup text and allows it to be empty', () => {
    expect(
      parseSettingsForm({ ...valid, pickupInstructions: '  hello \n' }),
    ).toMatchObject({ data: { pickupInstructions: 'hello' } })
    expect(
      parseSettingsForm({ ...valid, pickupInstructions: '' }),
    ).toMatchObject({ ok: true, data: { pickupInstructions: '' } })
  })

  it('accepts exactly 500 characters and rejects 501', () => {
    expect(
      parseSettingsForm({ ...valid, pickupInstructions: 'a'.repeat(500) }).ok,
    ).toBe(true)
    expect(
      parseSettingsForm({ ...valid, pickupInstructions: 'a'.repeat(501) }),
    ).toEqual({ ok: false, errors: { pickupInstructions: 'tooLong' } })
  })

  it('reports input of the wrong shape as invalid and drops extra fields', () => {
    expect(parseSettingsForm({ zasilkovnaPrice: 5 })).toMatchObject({
      ok: false,
      errors: { zasilkovnaPrice: 'invalid' },
    })
    const result = parseSettingsForm({ ...valid, id: 2 })
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && 'id' in result.data).toBe(false)
  })
})
