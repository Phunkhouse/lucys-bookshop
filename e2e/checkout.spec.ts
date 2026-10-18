import { expect, test, type Browser, type Page } from '@playwright/test'
import { TEST_ACCOUNT_DISPLAY } from '../src/server/test-iban'
import {
  E2E_BUYER_EMAIL,
  E2E_PICKUP_INSTRUCTIONS,
  E2E_ZASILKOVNA_PRICE_MINOR,
} from './checkout-fixtures'

// Each test buys its own seed books (src/server/db/seed-data.ts), so the tests
// do not depend on each other and leave the books the other specs read alone.
// The books are reserved by these orders until the next run's setup:
//   seed0004 Hvězdy nad Hradčany 159 Kč, seed0006 Kuchařka mé babičky 120 Kč,
//   seed0007 Letní básně 140 Kč, seed0008 Dějiny jednoho města 390 Kč,
//   seed0009 Tides of Salt (price read from the page).

const ORDER_URL = /\/order\/[A-Za-z0-9_-]{43}$/

// The slug is cosmetic: a wrong one redirects to the right page.
async function addToCart(page: Page, shortId: string) {
  await page.goto(`/books/${shortId}/x`)
  await page.getByRole('button', { name: 'Přidat do košíku' }).click()
  await expect(page.getByRole('status')).toContainText('Kniha je v košíku.')
}

async function openCheckout(page: Page) {
  await page.goto('/cart')
  await page.getByRole('link', { name: 'Pokračovat k objednávce' }).click()
  await expect(page).toHaveURL('/checkout')
  await expect(
    page.getByRole('region', { name: 'Vaše objednávka' }),
  ).toBeVisible()
}

async function fillContactAndConsent(page: Page) {
  await page.getByLabel('Jméno a příjmení').fill('Jana Nováková')
  await page.getByLabel('E-mail').fill(E2E_BUYER_EMAIL)
  await page.getByLabel('Telefon').fill('+420 601 234 567')
  await page.getByLabel('Souhlasím s obchodními podmínkami').check()
  await page.getByLabel('Beru na vědomí zásady ochrany osobních údajů').check()
}

async function placeOrder(page: Page) {
  await page.getByRole('button', { name: 'Odeslat objednávku' }).click()
  await expect(page).toHaveURL(ORDER_URL)
}

function orderNumber(page: Page) {
  return page.getByRole('heading', { level: 1 })
}

test.describe('checkout', () => {
  test('buys two books by bank transfer with personal pickup', async ({
    page,
  }) => {
    await addToCart(page, 'seed0004')
    await addToCart(page, 'seed0006')
    await openCheckout(page)

    const summary = page.getByRole('region', { name: 'Vaše objednávka' })
    await expect(summary).toContainText('Hvězdy nad Hradčany')
    await expect(summary).toContainText('Kuchařka mé babičky')
    await expect(summary).toContainText('zdarma')
    await expect(summary.getByText(/^279\s*Kč$/)).toHaveCount(2) // books, total

    await fillContactAndConsent(page)
    await placeOrder(page)

    await expect(orderNumber(page)).toHaveText(/^Objednávka č\. \d{8}$/)
    const number = (await orderNumber(page).innerText()).replace(/\D/g, '')
    await expect(
      page.getByRole('heading', { name: 'Čeká na platbu' }),
    ).toBeVisible()

    // The payment details, or a clear message when this server has no account set.
    const pay = page.getByRole('region', { name: 'Zaplaťte převodem' })
    if (await pay.getByText('Platební údaje nejsou zatím nastavené').count()) {
      test.info().annotations.push({
        type: 'note',
        description: 'This server has no SELLER_IBAN: QR code not checked.',
      })
    } else {
      await expect(
        pay.getByRole('img', { name: 'QR kód pro platbu' }),
      ).toBeVisible()
      await expect(pay).toContainText(number) // the variable symbol
      await expect(pay.getByText(/^279\s*Kč$/)).toBeVisible()
      // A server this run started has the test account; one that was already
      // running may have another, so only its shape is checked there.
      if (process.env.CI) {
        await expect(pay.getByText(TEST_ACCOUNT_DISPLAY)).toBeVisible()
      } else {
        await expect(pay.getByText(/^(\d+-)?\d+\/\d{4}$/)).toBeVisible()
      }
    }
    await expect(page.getByText(/rezervované do/)).toBeVisible()

    // The cart was emptied, and the link keeps working after a reload.
    await expect(
      page.getByRole('link', { name: 'Košík', exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(orderNumber(page)).toHaveText(`Objednávka č. ${number}`)

    // The books are held for this buyer now.
    await page.goto('/books/seed0004/hvezdy-nad-hradcany')
    await expect(page.getByText('Rezervováno')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Přidat do košíku' }),
    ).toBeDisabled()
  })

  test('reserves a book for cash on pickup, with the pickup instructions and no QR code', async ({
    page,
  }) => {
    await addToCart(page, 'seed0007')
    await openCheckout(page)
    await expect(page.getByText(E2E_PICKUP_INSTRUCTIONS)).toBeVisible()

    await fillContactAndConsent(page)
    await page.getByLabel('Hotově při osobním převzetí').check()
    await placeOrder(page)

    await expect(
      page.getByRole('heading', {
        name: 'Rezervováno, zaplatíte při převzetí',
      }),
    ).toBeVisible()
    await expect(page.getByText(E2E_PICKUP_INSTRUCTIONS)).toBeVisible()
    await expect(
      page.getByRole('img', { name: 'QR kód pro platbu' }),
    ).toHaveCount(0)
    await expect(page.getByText('Číslo účtu')).toHaveCount(0)
  })

  test('adds the Zásilkovna rate and keeps the pickup point', async ({
    page,
  }) => {
    await addToCart(page, 'seed0008')
    await openCheckout(page)
    const summary = page.getByRole('region', { name: 'Vaše objednávka' })

    // Cash is only for personal pickup.
    await expect(page.getByLabel('Hotově při osobním převzetí')).toBeVisible()
    await page.getByLabel(/^Zásilkovna/).check()
    await expect(page.getByLabel('Hotově při osobním převzetí')).toHaveCount(0)
    await expect(summary.getByText(/^89\s*Kč$/)).toBeVisible()
    await expect(summary.getByText(/^479\s*Kč$/)).toBeVisible()

    await fillContactAndConsent(page)
    // Without the pickup point the form says so and sends nothing.
    await page.getByRole('button', { name: 'Odeslat objednávku' }).click()
    await expect(
      page.getByText('Napište výdejní místo Zásilkovny.'),
    ).toBeVisible()
    await expect(page).toHaveURL('/checkout')

    await page
      .getByLabel('Výdejní místo Zásilkovny')
      .fill('Z-Box Praha 1, Dlouhá 5')
    await placeOrder(page)

    const order = page.getByRole('region', { name: 'Co jste objednali' })
    await expect(order).toContainText('Dějiny jednoho města')
    await expect(order).toContainText('Z-Box Praha 1, Dlouhá 5')
    await expect(order.getByText(/^89\s*Kč$/)).toBeVisible()
    await expect(order.getByText(/^479\s*Kč$/)).toBeVisible()
    expect(E2E_ZASILKOVNA_PRICE_MINOR).toBe(8900) // the setup's value, 89 Kč
  })

  test('tells a buyer who was too late which book was taken, and keeps the cart honest', async ({
    page,
    browser,
  }) => {
    await addToCart(page, 'seed0009')
    await openCheckout(page)
    await fillContactAndConsent(page)

    // Meanwhile somebody else buys the same book, start to finish.
    await buySeparately(browser, 'seed0009')

    await page.getByRole('button', { name: 'Odeslat objednávku' }).click()

    // By its text: a production build also has a route announcer with an alert
    // role, and the changed-cart notice below is one too.
    await expect(
      page.getByText('Některá z knih se mezitím už nedá koupit'),
    ).toBeVisible()
    await expect(page).toHaveURL('/checkout')
    // The summary is checked again: the book is no longer buyable.
    await expect(
      page.getByRole('link', { name: 'Zpět do košíku' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Odeslat objednávku' }),
    ).toBeDisabled()

    await page.getByRole('link', { name: 'Zpět do košíku' }).click()
    await expect(
      page.getByText('Tides of Salt – mezitím ji rezervoval někdo jiný.'),
    ).toBeVisible()
    await expect(page.getByText('Košík je prázdný.')).toBeVisible()
  })

  test('answers 404 for an unknown order link', async ({ page }) => {
    const response = await page.goto(`/order/${'A'.repeat(43)}`)
    expect(response?.status()).toBe(404)
    expect((await page.goto('/order/abc'))?.status()).toBe(404)
  })
})

// A second visitor with a cart of their own.
async function buySeparately(browser: Browser, shortId: string) {
  const context = await browser.newContext()
  try {
    const other = await context.newPage()
    await addToCart(other, shortId)
    await openCheckout(other)
    await fillContactAndConsent(other)
    await placeOrder(other)
  } finally {
    await context.close()
  }
}
