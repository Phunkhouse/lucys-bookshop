import { describe, expect, it } from 'vitest'
import {
  reservationReminderMessage,
  type ExpiringOrder,
} from './notification-messages'

const orders: ExpiringOrder[] = [
  {
    number: 20260007,
    name: 'Jana Nováková',
    totalMinor: 23900,
    currency: 'CZK',
    // 22:30 UTC is already the next day in Prague.
    expiresAt: new Date('2026-10-18T22:30:00.000Z'),
    adminUrl: 'https://shop.example/admin/orders/20260007',
  },
  {
    number: 20260009,
    name: 'Petr Svoboda',
    totalMinor: 5050,
    currency: 'CZK',
    expiresAt: new Date('2026-10-19T09:00:00.000Z'),
    adminUrl: 'https://shop.example/admin/orders/20260009',
  },
]

describe('reservationReminderMessage', () => {
  it('puts how many orders are due into the subject', () => {
    expect(reservationReminderMessage(orders).subject).toBe(
      'Brzy vyprší rezervace (2)',
    )
    expect(reservationReminderMessage([orders[0]]).subject).toBe(
      'Brzy vyprší rezervace (1)',
    )
  })

  it('lists every order with buyer, total, deadline and link, in the order given', () => {
    const { text } = reservationReminderMessage(orders)

    expect(text).toContain('Jana Nováková')
    expect(text).toMatch(/239\s*Kč/)
    expect(text).toMatch(/19\. října 2026.*0:30/)
    expect(text).toContain('https://shop.example/admin/orders/20260007')
    expect(text).toContain('Petr Svoboda')
    expect(text).toMatch(/50,50\s*Kč/)
    expect(text).toContain('https://shop.example/admin/orders/20260009')
    expect(text.indexOf('20260007')).toBeLessThan(text.indexOf('20260009'))
  })

  it('says what to do about it', () => {
    expect(reservationReminderMessage(orders).text).toContain(
      'Napsat kupujícímu',
    )
  })

  // Like the new-order mail: contact details stay behind the admin login.
  it('never contains contact details or the note, even if the object has them', () => {
    const leaky = orders.map((order) => ({
      ...order,
      email: 'tajny.kupujici@example.test',
      phone: '+420 999 888 777',
      note: 'soukromá poznámka',
    })) as ExpiringOrder[]

    const { subject, text } = reservationReminderMessage(leaky)

    for (const secret of [
      'tajny.kupujici@example.test',
      '999 888 777',
      'soukromá poznámka',
    ]) {
      expect(subject).not.toContain(secret)
      expect(text).not.toContain(secret)
    }
  })

  it('keeps a "{" in a name as it is', () => {
    const { text } = reservationReminderMessage([
      { ...orders[0], name: 'Jana {number} {link}' },
    ])

    expect(text).toContain('Jana {number} {link}')
  })
})
