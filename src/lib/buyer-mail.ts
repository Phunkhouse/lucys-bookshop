import type { OrderStage } from '@/server/order-stage'

// A mailto: link (spec 6.7): the seller's own mail program opens with the text
// filled in. Everything is percent-encoded, so a name or tracking number
// containing "&cc=..." stays inside the text and cannot add a header. Line
// breaks are CRLF, as mail programs expect.
export function mailtoHref({
  to,
  subject,
  body,
}: {
  to: string
  subject?: string
  body?: string
}): string {
  const address = encodeURIComponent(to).replace('%40', '@')
  if (subject === undefined && body === undefined) return `mailto:${address}`
  const encode = (text: string) =>
    encodeURIComponent(text.replace(/\r?\n/g, '\r\n'))
  return `mailto:${address}?subject=${encode(subject ?? '')}&body=${encode(body ?? '')}`
}

export type BuyerMessageKind = 'reminder' | 'paid' | 'shipped'

// Which ready-made message fits the order. Finished orders get none: the
// seller writes those by hand.
export function buyerMessageKind(stage: OrderStage): BuyerMessageKind | null {
  switch (stage) {
    case 'awaiting_payment':
    case 'expired':
      return 'reminder'
    case 'paid':
      return 'paid'
    case 'shipped':
      return 'shipped'
    default:
      return null
  }
}
