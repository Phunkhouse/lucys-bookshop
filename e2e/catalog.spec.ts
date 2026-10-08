import { expect, test, type Page } from '@playwright/test'

// These tests read the invented seed data (src/server/db/seed-data.ts):
// 18 available, 5 reserved (2 of them expired), 3 sold within 14 days,
// 2 sold longer ago and 2 hidden books.

function card(page: Page, title: string) {
  return page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: title }) })
}

test.describe('catalog', () => {
  test('lists the books a visitor may see, with their statuses', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.getByText('26 knih')).toBeVisible()
    await expect(card(page, 'Stíny nad Vltavou')).toBeVisible()
    await expect(card(page, 'Mrtvá schránka')).toContainText('Rezervováno')
    await expect(card(page, 'Gardens of Winter')).toContainText('Prodáno')
  })

  test('treats an expired reservation as available', async ({ page }) => {
    await page.goto('/')

    await expect(card(page, 'Ostrov bez jména')).toBeVisible()
    await expect(card(page, 'Ostrov bez jména')).not.toContainText(
      'Rezervováno',
    )
  })

  test('leaves out hidden books and books sold long ago', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('26 knih')).toBeVisible()

    for (const title of [
      'Skryté kapitoly', // hidden
      'Plavba k jihu', // sold 20 days ago
      'Sbírka drobných zločinů', // sold 60 days ago
    ]) {
      await expect(page.getByRole('heading', { name: title })).toHaveCount(0)
    }
  })
})

test.describe('book detail', () => {
  test('opens from a catalog card and links back', async ({ page }) => {
    await page.goto('/')
    await card(page, 'Stíny nad Vltavou')
      .getByRole('link', { name: 'Stíny nad Vltavou' })
      .click()

    await expect(page).toHaveURL('/books/seed0001/stiny-nad-vltavou')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Stíny nad Vltavou' }),
    ).toBeVisible()
    await expect(page.getByText('Marta Hrubešová')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Přidat do košíku' }),
    ).toBeDisabled()

    await page.getByRole('link', { name: 'Zpět na knihy' }).click()
    await expect(page).toHaveURL('/')
  })

  test('redirects an outdated slug permanently to the canonical URL', async ({
    page,
    request,
  }) => {
    const response = await request.get('/books/seed0001/stary-nazev', {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(308)
    expect(response.headers()['location']).toContain(
      '/books/seed0001/stiny-nad-vltavou',
    )

    await page.goto('/books/seed0001/stary-nazev')
    await expect(page).toHaveURL('/books/seed0001/stiny-nad-vltavou')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Stíny nad Vltavou',
    )
  })

  test('explains that a reserved book is taken', async ({ page }) => {
    await page.goto('/books/seed0019/mrtva-schranka')

    await expect(page.getByText('Rezervováno')).toBeVisible()
    await expect(
      page.getByText('Tato kniha je právě rezervovaná pro jiného zákazníka.'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Přidat do košíku' }),
    ).toBeDisabled()
  })

  test('still opens a book sold long ago, with a sold notice', async ({
    page,
  }) => {
    // Sold 20 days ago: gone from the catalog, but shared links keep working.
    await page.goto('/books/seed0027/plavba-k-jihu')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Plavba k jihu',
    )
    await expect(page.getByText('Prodáno', { exact: true })).toBeVisible()
    await expect(page.getByText(/Tato kniha už byla prodána/)).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Přidat do košíku' }),
    ).toBeDisabled()
  })

  test('answers 404 for a hidden book and for an unknown one', async ({
    page,
  }) => {
    for (const path of [
      '/books/seed0029/skryte-kapitoly', // hidden
      '/books/nothere/whatever', // unknown
      '/books/NOT-VALID/whatever', // malformed id
    ]) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
      await expect(
        page.getByRole('heading', { name: 'Stránka nenalezena' }),
      ).toBeVisible()
    }
  })
})
