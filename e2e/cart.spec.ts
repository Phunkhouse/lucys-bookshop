import { expect, test, type Page } from '@playwright/test'

// Seed books (src/server/db/seed-data.ts): seed0001 "Stíny nad Vltavou" costs
// 189 Kč and is available; seed0019 "Mrtvá schránka" is reserved.

const CART_KEY = 'cart.v1'

// The cart is kept in the browser, so a test prepares it there.
async function putInCart(
  page: Page,
  items: { shortId: string; priceMinorSeen: number }[],
) {
  await page.goto('/')
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [CART_KEY, JSON.stringify({ v: 1, items })],
  )
}

test.describe('cart', () => {
  test('adds a book, keeps it after a reload, and takes it out again', async ({
    page,
  }) => {
    await page.goto('/books/seed0001/stiny-nad-vltavou')
    await page.getByRole('button', { name: 'Přidat do košíku' }).click()

    await expect(page.getByRole('status')).toContainText('Kniha je v košíku.')
    await expect(
      page.getByRole('link', { name: 'Košík: 1 kniha' }),
    ).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole('button', { name: 'Odebrat z košíku' }),
    ).toBeVisible()

    await page.getByRole('link', { name: 'Zobrazit košík' }).click()
    await expect(page).toHaveURL('/cart')
    await expect(
      page.getByRole('link', { name: 'Stíny nad Vltavou' }),
    ).toBeVisible()
    await expect(page.getByText('Mezisoučet (bez dopravy)')).toBeVisible()
    await expect(page.locator('strong')).toHaveText(/189\s*Kč/)

    await page
      .getByRole('button', { name: 'Odebrat z košíku: Stíny nad Vltavou' })
      .click()
    await expect(page.getByText('Košík je prázdný.')).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Košík', exact: true }),
    ).toBeVisible()
  })

  test('removes a book that is reserved by someone else and says why', async ({
    page,
  }) => {
    await putInCart(page, [
      { shortId: 'seed0001', priceMinorSeen: 18900 },
      { shortId: 'seed0019', priceMinorSeen: 10000 },
    ])

    await page.goto('/cart')

    await expect(
      page.getByText('Mrtvá schránka – mezitím ji rezervoval někdo jiný.'),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Stíny nad Vltavou' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Mrtvá schránka' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Košík: 1 kniha' }),
    ).toBeVisible()
  })

  test('asks to confirm a price that changed since the book was added', async ({
    page,
  }) => {
    await putInCart(page, [{ shortId: 'seed0001', priceMinorSeen: 10000 }])

    await page.goto('/cart')
    await expect(
      page.getByText(/Cena se změnila: dříve 100\s*Kč, nyní 189\s*Kč/),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Souhlasím s novou cenou' }).click()

    await expect(page.getByText(/Cena se změnila/)).toHaveCount(0)
    await expect(page.locator('strong')).toHaveText(/189\s*Kč/)
  })

  test('shows the empty cart to a new visitor', async ({ page }) => {
    await page.goto('/cart')

    await expect(page.getByText('Košík je prázdný.')).toBeVisible()
    await page.getByRole('link', { name: 'Zpět na knihy' }).click()
    await expect(page).toHaveURL('/')
  })
})
