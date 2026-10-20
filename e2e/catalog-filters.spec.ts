import { expect, test, type Page } from '@playwright/test'

// Search, filters, sort and pages of the catalog (ADR 0022). Like
// catalog.spec.ts, these tests read the invented seed data
// (src/server/db/seed-data.ts): 26 listed books, so two pages.

const SEARCH_BOX = 'Hledat podle názvu, autora nebo ISBN'

function title(page: Page, name: string) {
  return page.getByRole('heading', { name, level: 2 })
}

async function submit(page: Page) {
  await page.getByRole('button', { name: 'Zobrazit' }).click()
}

test.describe('catalog search and filters', () => {
  test('narrows by search and genre, keeps the view in the URL and in the back button', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(title(page, 'Stíny nad Vltavou')).toBeVisible()

    // The search ignores accents: "hvezdy" finds "Hvězdy nad Hradčany".
    await page.getByLabel(SEARCH_BOX).fill('hvezdy')
    await submit(page)
    await expect(page).toHaveURL('/?q=hvezdy')
    await expect(page.getByText('1 kniha')).toBeVisible()
    await expect(title(page, 'Hvězdy nad Hradčany')).toBeVisible()
    await expect(title(page, 'Stíny nad Vltavou')).toHaveCount(0)

    // A genre filter on its own, with the search cleared.
    await page.goto('/')
    await page.getByText('Filtry').click()
    await page.getByLabel('Fantasy').check()
    await submit(page)
    await expect(page).toHaveURL('/?genre=fantasy')
    await expect(title(page, 'Vlk z Černé hory')).toBeVisible()
    await expect(title(page, 'Stíny nad Vltavou')).toHaveCount(0)
    await expect(page.getByText('Filtry (1)')).toBeVisible()

    // Search inside the genre: both stay in the URL.
    await page.getByLabel(SEARCH_BOX).fill('vlk')
    await submit(page)
    await expect(page).toHaveURL('/?q=vlk&genre=fantasy')
    await expect(page.getByText('1 kniha')).toBeVisible()
    await expect(title(page, 'Vlk z Černé hory')).toBeVisible()

    // Back goes through the views one by one.
    await page.goBack()
    await expect(page).toHaveURL('/?genre=fantasy')
    await expect(title(page, 'Beyond the Amber Gate')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL('/')
    await expect(title(page, 'Stíny nad Vltavou')).toBeVisible()
  })

  test('resets the search and the filters', async ({ page }) => {
    await page.goto('/?q=vlk&genre=fantasy&sort=title')
    await expect(page.getByText('1 kniha')).toBeVisible()

    await page.getByRole('link', { name: 'Zrušit hledání a filtry' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByText('26 knih')).toBeVisible()
  })

  test('shows a friendly message when nothing matches', async ({ page }) => {
    await page.goto('/?q=nic-takového-tu-neni')

    await expect(
      page.getByText('Žádná kniha neodpovídá vašemu výběru.'),
    ).toBeVisible()
    await expect(page.getByText('0 knih')).toBeVisible()
    // The form stays, so the search can be changed.
    await expect(page.getByLabel(SEARCH_BOX)).toHaveValue(
      'nic-takového-tu-neni',
    )
  })

  test('sorts by price, cheapest first', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Řadit podle').selectOption('price-asc')
    await submit(page)
    await expect(page).toHaveURL('/?sort=price-asc')

    // Available books first, each group cheapest first: read the first prices.
    const prices = await page
      .getByRole('article')
      .locator('p')
      .filter({ hasText: /Kč/ })
      .allInnerTexts()
    const crowns = prices
      .slice(0, 5)
      .map((p) => Number(p.replace(/[^\d,]/g, '').replace(',', '.')))
    expect(crowns).toHaveLength(5)
    expect(crowns).toEqual([...crowns].sort((a, b) => a - b))
  })

  test('moves between pages and keeps the page in the URL', async ({
    page,
  }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Stránkování' })
    await expect(nav.getByRole('link', { name: 'Stránka 1' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await nav.getByRole('link', { name: 'Stránka 2' }).click()
    await expect(page).toHaveURL('/?page=2')
    await expect(page.getByRole('article')).toHaveCount(2)
    await expect(nav.getByRole('link', { name: 'Stránka 2' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.getByRole('link', { name: 'Předchozí' }).click()
    await expect(page).toHaveURL('/')
  })

  test('sends a messy link to its short form', async ({ page }) => {
    await page.goto('/?q=&sort=newest&genre=fantasy&min=&max=&utm_source=x')
    await expect(page).toHaveURL('/?genre=fantasy')
  })
})
