import { describe, expect, it } from 'vitest'
import { newOrderMessage, type NotifiableOrder } from './notification-messages'

const order: NotifiableOrder = {
  number: 20260007,
  name: 'Jana Nováková',
  items: [
    { title: 'Babička', priceMinor: 18900 },
    { title: 'Saturnin', priceMinor: 5000 },
  ],
  totalMinor: 23900,
  currency: 'CZK',
  paymentMethod: 'bank_transfer',
  shippingMethod: 'pickup',
  // 22:30 UTC is already the next day in Prague.
  expiresAt: new Date('2026-10-18T22:30:00.000Z'),
  adminUrl: 'https://shop.example/admin/orders/20260007',
}

describe('newOrderMessage', () => {
  it('puts the number and the total into the subject', () => {
    const { subject } = newOrderMessage(order)

    expect(subject).toMatch(/^Nová objednávka č\. 20260007 \(239\s*Kč\)$/)
  })

  it('lists the buyer, every book with its price, and the total', () => {
    const { text } = newOrderMessage(order)

    expect(text).toContain('Jana Nováková')
    expect(text).toMatch(/Babička.*189\s*Kč/)
    expect(text).toMatch(/Saturnin.*50\s*Kč/)
    expect(text).toMatch(/Celkem.*239\s*Kč/)
  })

  it('says how the buyer pays and receives the books', () => {
    const bank = newOrderMessage(order).text
    expect(bank).toContain('Převodem')
    expect(bank).toContain('Osobní odběr')

    const cash = newOrderMessage({
      ...order,
      paymentMethod: 'cash_on_pickup',
    }).text
    expect(cash).toContain('Hotově při převzetí')

    const parcel = newOrderMessage({
      ...order,
      shippingMethod: 'zasilkovna',
    }).text
    expect(parcel).toContain('Zásilkovna')
  })

  it('gives the reservation deadline on the shop clock', () => {
    expect(newOrderMessage(order).text).toMatch(/19\. října 2026.*0:30/)
  })

  it('links the admin page of the order', () => {
    expect(newOrderMessage(order).text).toContain(
      'https://shop.example/admin/orders/20260007',
    )
  })

  // The email travels through a provider and a mailbox. Contact details and
  // the seller's note stay behind the admin login: even an order object that
  // carries them must not leak them into the text.
  it('never contains the buyer contact details or the note', () => {
    const leaky = {
      ...order,
      email: 'tajny.kupujici@example.test',
      phone: '+420 999 888 777',
      note: 'soukromá poznámka',
      shippingDetails: 'Výdejní místo Tajná 1',
    } as NotifiableOrder

    const { subject, text } = newOrderMessage(leaky)

    for (const secret of [
      'tajny.kupujici@example.test',
      '999 888 777',
      'soukromá poznámka',
      'Tajná 1',
    ]) {
      expect(subject).not.toContain(secret)
      expect(text).not.toContain(secret)
    }
  })

  it('stays plain text: a title with markup is not interpreted', () => {
    const { text } = newOrderMessage({
      ...order,
      items: [{ title: '<b>Kniha</b> & spol.', priceMinor: 100 }],
    })

    expect(text).toContain('<b>Kniha</b> & spol.')
  })

  it('keeps a "{" in a title or name as it is', () => {
    const { text } = newOrderMessage({
      ...order,
      name: 'Jana {number}',
      items: [{ title: 'O {name}', priceMinor: 100 }],
    })

    expect(text).toContain('Jana {number}')
    expect(text).toContain('O {name}')
  })
})
