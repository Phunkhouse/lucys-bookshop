import messages from '../../messages/cs.json'
import { SHOP_TIME_ZONE } from '@/lib/shop-time-zone'

// What the seller is told about a new order (spec 6.8). Deliberately without the
// buyer's e-mail, phone, pickup point and the seller's note: the message
// travels through a provider and a mailbox, so those stay behind the admin
// login, one link away.
export type NotifiableOrder = {
  number: number
  name: string
  items: { title: string; priceMinor: number }[]
  totalMinor: number
  currency: string
  paymentMethod: 'bank_transfer' | 'cash_on_pickup'
  shippingMethod: 'pickup' | 'zasilkovna'
  expiresAt: Date
  adminUrl: string
}

export type NotificationMessage = { subject: string; text: string }

// Plain {placeholder} filling in one pass, so a value that itself contains
// "{number}" (a book title, a name) is kept as it is. No ICU: these are mails,
// not screens, and need no plurals.
function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

// Minor units: whole crowns without decimals, anything else with two.
function money(minor: number, currency: string) {
  const digits = minor % 100 === 0 ? 0 : 2
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 100)
}

const deadlineFormat = new Intl.DateTimeFormat('cs-CZ', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: SHOP_TIME_ZONE,
})

export function newOrderMessage(order: NotifiableOrder): NotificationMessage {
  const t = messages.Notifications.newOrder
  const total = money(order.totalMinor, order.currency)
  const items = order.items
    .map((item) =>
      fill(t.item, {
        title: item.title,
        price: money(item.priceMinor, order.currency),
      }),
    )
    .join('\n')

  return {
    subject: fill(t.subject, { number: order.number, total }),
    text: fill(t.body, {
      number: order.number,
      name: order.name,
      items,
      total,
      payment: messages.Admin.orders.payment[order.paymentMethod],
      shipping: messages.Admin.orders.shipping[order.shippingMethod],
      deadline: deadlineFormat.format(order.expiresAt),
      link: order.adminUrl,
    }),
  }
}

// An unpaid order whose reservation ends soon (spec 6.4). Like the new-order
// mail, no contact details: the admin link is one tap away.
export type ExpiringOrder = {
  number: number
  name: string
  totalMinor: number
  currency: string
  expiresAt: Date
  adminUrl: string
}

// One mail for all orders due in a run, in the order given (the caller sorts).
export function reservationReminderMessage(
  orders: ExpiringOrder[],
): NotificationMessage {
  const t = messages.Notifications.reminder
  const lines = orders
    .map((order) =>
      fill(t.order, {
        number: order.number,
        name: order.name,
        total: money(order.totalMinor, order.currency),
        deadline: deadlineFormat.format(order.expiresAt),
        link: order.adminUrl,
      }),
    )
    .join('\n')

  return {
    subject: fill(t.subject, { count: orders.length }),
    text: fill(t.body, { orders: lines }),
  }
}
