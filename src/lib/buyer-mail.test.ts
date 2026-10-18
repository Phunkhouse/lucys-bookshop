import { describe, expect, it } from 'vitest'
import { buyerMessageKind, mailtoHref } from './buyer-mail'
import type { OrderStage } from '@/server/order-stage'

function parts(href: string) {
  const url = new URL(href)
  return {
    to: decodeURIComponent(url.pathname),
    subject: url.searchParams.get('subject'),
    body: url.searchParams.get('body'),
    keys: [...url.searchParams.keys()],
  }
}

describe('mailtoHref', () => {
  it('builds a link with the address, subject and body', () => {
    const href = mailtoHref({
      to: 'jana@example.com',
      subject: 'Objednávka č. 20260007',
      body: 'Dobrý den,\n\ndíky.',
    })

    expect(href.startsWith('mailto:jana@example.com?')).toBe(true)
    expect(parts(href)).toMatchObject({
      to: 'jana@example.com',
      subject: 'Objednávka č. 20260007',
    })
  })

  it('writes line breaks the way mail programs expect', () => {
    const href = mailtoHref({ to: 'a@b.cz', subject: 's', body: 'one\ntwo' })

    expect(href).toContain('body=one%0D%0Atwo')
    expect(parts(href).body).toBe('one\r\ntwo')
  })

  it('keeps Czech letters and punctuation intact', () => {
    const body = 'Žluťoučký kůň? Ano & ne #1 = ok; 50 % hotovo'
    const href = mailtoHref({ to: 'a@b.cz', subject: 'č. 1', body })

    expect(href).not.toMatch(/[ěščřžýáíéúů]/)
    expect(parts(href).body).toBe(body)
  })

  it('keeps a plus sign in the address', () => {
    const href = mailtoHref({
      to: 'jana+kniha@example.com',
      subject: 's',
      body: 'b',
    })

    expect(parts(href).to).toBe('jana+kniha@example.com')
  })

  // The tracking number and the buyer's name end up in the text. Whatever they
  // contain must stay inside the body and never add a header.
  it('cannot add a header through the subject or the body', () => {
    const href = mailtoHref({
      to: 'a@b.cz',
      subject: 'x&cc=evil@example.com',
      body: 'y&bcc=evil@example.com\r\ncc: evil@example.com',
    })

    expect(parts(href).keys).toEqual(['subject', 'body'])
    expect(parts(href).subject).toBe('x&cc=evil@example.com')
  })
})

describe('buyerMessageKind', () => {
  it.each([
    ['awaiting_payment', 'reminder'],
    ['expired', 'reminder'],
    ['paid', 'paid'],
    ['shipped', 'shipped'],
    ['completed', null],
    ['cancelled', null],
    ['refunded', null],
  ] as [OrderStage, string | null][])('%s gives %s', (stage, kind) => {
    expect(buyerMessageKind(stage)).toBe(kind)
  })
})
