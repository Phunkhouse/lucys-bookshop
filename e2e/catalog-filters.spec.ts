import { expect, test, type Page } from '@playwright/test'

// Search, filters, sort and pages of the catalog (ADR 0022). Like
// catalog.spec.ts, these tests read the invented seed data
// (src/server/db/seed-data.ts): 26 listed books of which 20 count as available
// (2 reserved ones have expired), and a page holds 24 books, so there are two
// pages and the second has 2 books. Adding or removing seed books means
// updating the numbers here.

const SEARCH_BOX = 'Hledat podle názvu, autora nebo ISBN'

function title(page: Page, name: string) {
  return page.getByRole('heading', { name, level: 2 })
}

const count = (page: Page, text: string) =>
  page.getByText(text, { exact: true })

async function submit(page: Page) {
  await page.getByRole('button', { name: 'Zobrazit' }).click()
}

async function openFilters(page: Page) {
  await page.getByText('Filtry', { exact: true }).click()
}

test.describe('catalog search', () => {
  test('ignores accents: "hvezdy" finds "Hvězdy nad Hradčany"', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(title(page, 'Stíny nad Vltavou')).toBeVisible()

    await page.getByLabel(SEARCH_BOX).fill('hvezdy')
    await submit(page)

    await expect(page).toHaveURL('/?q=hvezdy')
    await expect(count(page, '1 kniha')).toBeVisible()
    await expect(title(page, 'Hvězdy nad Hradčany')).toBeVisible()
    await expect(title(page, 'Stíny nad Vltavou')).toHaveCount(0)
  })

  test('finds a book by its ISBN, with or without hyphens', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByLabel(SEARCH_BOX).fill('978-0-00-000001-9')
    await submit(page)

    await expect(count(page, '1 kniha')).toBeVisible()
    await expect(title(page, 'Stíny nad Vltavou')).toBeVisible()

    await page.goto('/?q=9780000000019')
    await expect(count(page, '1 kniha')).toBeVisible()
    await expect(title(page, 'Stíny nad Vltavou')).toBeVisible()
  })

  test('shows a friendly message when nothing matches', async ({ page }) => {
    await page.goto('/?q=nic-takového-tu-neni')

    await expect(
      page.getByText('Žádná kniha neodpovídá vašemu výběru.'),
    ).toBeVisible()
    await expect(count(page, '0 knih')).toBeVisible()
    // The form stays, so the search can be changed.
    await expect(page.getByLabel(SEARCH_BOX)).toHaveValue(
      'nic-takového-tu-neni',
    )
  })
})

test.describe('catalog filters', () => {
  test('narrows by genre, then by search, and the back button goes through each view', async ({
    page,
  }) => {
    await page.goto('/')
    await openFilters(page)
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
    await expect(count(page, '1 kniha')).toBeVisible()
    await expect(title(page, 'Vlk z Černé hory')).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL('/?genre=fantasy')
    await expect(title(page, 'Beyond the Amber Gate')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL('/')
    await expect(title(page, 'Stíny nad Vltavou')).toBeVisible()
  })

  test('shows only available books, expired reservations included', async ({
    page,
  }) => {
    await page.goto('/')
    await openFilters(page)
    await page.getByLabel('Jen dostupné knihy').check()
    await submit(page)

    await expect(page).toHaveURL('/?available=1')
    await expect(count(page, '20 knih')).toBeVisible()
    // Reserved (not expired) and sold books are gone; an expired reservation stays.
    await expect(title(page, 'Mrtvá schránka')).toHaveCount(0)
    await expect(title(page, 'Gardens of Winter')).toHaveCount(0)
    await expect(title(page, 'Ostrov bez jména')).toBeVisible()
  })

  test('resets the search and the filters', async ({ page }) => {
    await page.goto('/?q=vlk&genre=fantasy&sort=title')
    await expect(count(page, '1 kniha')).toBeVisible()

    await page.getByRole('link', { name: 'Zrušit hledání a filtry' }).click()
    await expect(page).toHaveURL('/')
    await expect(count(page, '26 knih')).toBeVisible()
  })

  test('sends a messy link to its short form and still applies the filter', async ({
    page,
  }) => {
    await page.goto('/?q=&sort=newest&genre=fantasy&min=&max=&utm_source=x')

    await expect(page).toHaveURL('/?genre=fantasy')
    await expect(title(page, 'Vlk z Černé hory')).toBeVisible()
    await expect(title(page, 'Stíny nad Vltavou')).toHaveCount(0)
  })
})

test.describe('catalog sort and pages', () => {
  test('puts the cheapest available book first when sorted by price', async ({
    page,
  }) => {
    const firstTitle = (p: Page) =>
      p.getByRole('article').first().getByRole('heading')

    // The default order (newest first) does not start with it.
    await page.goto('/')
    await expect(firstTitle(page)).not.toHaveText('Rozhovory s tichem')

    await page.getByLabel('Řadit podle').selectOption('price-asc')
    await submit(page)

    await expect(page).toHaveURL('/?sort=price-asc')
    // 75 Kč, the cheapest of the books that can be bought.
    await expect(firstTitle(page)).toHaveText('Rozhovory s tichem')
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
})
