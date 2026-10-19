import { expect, test, type Page } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD_ENV } from './admin-account'
import { E2E_BUYER_EMAIL } from './checkout-fixtures'

// The seller's side of an order (spec 6.9): she sees it, records the payment,
// ships or hands over the books, and the buyer's own page follows.
// Each test buys its own seed book (src/server/db/seed-data.ts) that no other
// spec uses: seed0005 and seed0003.

const ORDER_URL = /\/order\/[A-Za-z0-9_-]{43}$/

async function buyerPlacesOrder(
  page: Page,
  shortId: string,
  options: { zasilkovna?: boolean } = {},
) {
  await page.goto(`/books/${shortId}/x`)
  await page.getByRole('button', { name: 'Přidat do košíku' }).click()
  await expect(page.getByRole('status')).toContainText('Kniha je v košíku.')
  await page.goto('/cart')
  await page.getByRole('link', { name: 'Pokračovat k objednávce' }).click()
  await expect(page).toHaveURL('/checkout')

  if (options.zasilkovna) {
    await page.getByLabel(/^Zásilkovna/).check()
    await page
      .getByLabel('Výdejní místo Zásilkovny')
      .fill('Z-Box Praha 1, Dlouhá 5')
  }
  await page.getByLabel('Jméno a příjmení').fill('Jana Nováková')
  await page.getByLabel('E-mail').fill(E2E_BUYER_EMAIL)
  await page.getByLabel('Telefon').fill('+420 601 234 567')
  await page.getByLabel('Souhlasím s obchodními podmínkami').check()
  await page.getByLabel('Beru na vědomí zásady ochrany osobních údajů').check()
  await page.getByRole('button', { name: 'Odeslat objednávku' }).click()
  await expect(page).toHaveURL(ORDER_URL)

  const heading = await page.getByRole('heading', { level: 1 }).innerText()
  return { orderUrl: page.url(), number: heading.replace(/\D/g, '') }
}

async function signIn(page: Page) {
  const password = process.env[E2E_ADMIN_PASSWORD_ENV]
  if (!password) throw new Error('The e2e admin password is missing.')
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL)
  await page.getByLabel('Heslo').fill(password)
  await page.getByRole('button', { name: 'Přihlásit se' }).click()
  await expect(page).toHaveURL('/admin')
}

async function openOrder(page: Page, number: string) {
  await page.goto('/admin/orders')
  await page.getByRole('link', { name: `Objednávka č. ${number}` }).click()
  await expect(page).toHaveURL(`/admin/orders/${number}`)
  await expect(
    page.getByRole('heading', { level: 1, name: `Objednávka č. ${number}` }),
  ).toBeVisible()
}

async function confirm(page: Page, open: string, yes: string) {
  await page.getByRole('button', { name: open }).click()
  await page.getByRole('button', { name: yes }).click()
}

test.describe('order management', () => {
  test('records a payment and hands a pickup over, and the buyer sees it', async ({
    page,
    browser,
  }) => {
    const { orderUrl, number } = await buyerPlacesOrder(page, 'seed0005')
    await signIn(page)

    // The list shows it waiting; the detail page offers payment, not shipping.
    await page.goto('/admin/orders?status=awaiting_payment')
    await expect(
      page.getByRole('link', { name: `Objednávka č. ${number}` }),
    ).toBeVisible()
    await openOrder(page, number)
    await expect(page.getByText('Jana Nováková')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Označit jako odeslané' }),
    ).toHaveCount(0)

    // Declining the question changes nothing.
    await page.getByRole('button', { name: 'Označit jako zaplacené' }).click()
    await page.getByRole('button', { name: 'Zpět' }).click()
    await expect(page.getByText('Čeká na platbu').first()).toBeVisible()

    await confirm(page, 'Označit jako zaplacené', 'Ano, zaplaceno')
    await expect(page.getByText('Zaplaceno', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Označit jako zaplacené' }),
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Označit jako vyřízené' }).click()
    await expect(page.getByText('Vyřízeno', { exact: true })).toBeVisible()

    // A note is saved and kept.
    await page.getByLabel('Poznámka').fill('Předáno osobně.')
    await page.getByRole('button', { name: 'Uložit poznámku' }).click()
    await expect(page.getByRole('status')).toHaveText('Uloženo')
    await page.reload()
    await expect(page.getByLabel('Poznámka')).toHaveValue('Předáno osobně.')

    // The buyer's own page, in a fresh browser with no admin session.
    const buyer = await (await browser.newContext()).newPage()
    await buyer.goto(orderUrl)
    await expect(buyer.getByRole('heading', { name: 'Vyřízeno' })).toBeVisible()
    // The seller's note is never on the buyer's page.
    await expect(buyer.getByText('Předáno osobně.')).toHaveCount(0)
    await buyer.context().close()
  })

  test('ships a Zásilkovna order with a tracking number and fixes a typo', async ({
    page,
    browser,
  }) => {
    const { orderUrl, number } = await buyerPlacesOrder(page, 'seed0003', {
      zasilkovna: true,
    })
    await signIn(page)
    await openOrder(page, number)

    await confirm(page, 'Označit jako zaplacené', 'Ano, zaplaceno')
    await expect(page.getByText('Zaplaceno', { exact: true })).toBeVisible()

    // A Zásilkovna order is shipped, not handed over, and needs a number.
    await expect(
      page.getByRole('button', { name: 'Označit jako vyřízené' }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Označit jako odeslané' }).click()
    await expect(page.getByText('Zadejte číslo zásilky')).toBeVisible()

    await page.getByLabel('Číslo zásilky').fill('Z1234567890')
    await page.getByRole('button', { name: 'Označit jako odeslané' }).click()
    await expect(page.getByText('Odesláno', { exact: true })).toBeVisible()

    await page.getByLabel('Číslo zásilky').fill('Z1234567899')
    await page.getByRole('button', { name: 'Uložit číslo zásilky' }).click()
    await expect(page.getByRole('status')).toHaveText('Uloženo')
    await page.reload()
    await expect(page.getByLabel('Číslo zásilky')).toHaveValue('Z1234567899')

    const buyer = await (await browser.newContext()).newPage()
    await buyer.goto(orderUrl)
    await expect(buyer.getByRole('heading', { name: 'Odesláno' })).toBeVisible()
    await expect(buyer.getByText('Z1234567899')).toBeVisible()
    await buyer.context().close()

    // A refund puts the book back on sale.
    await confirm(page, 'Vrátit peníze', 'Ano, vráceno')
    await expect(page.getByText('Vráceno', { exact: true })).toBeVisible()
    await page.goto('/books/seed0003/x')
    await expect(
      page.getByRole('button', { name: 'Přidat do košíku' }),
    ).toBeEnabled()
  })
})
