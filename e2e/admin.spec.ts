import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD_ENV } from './admin-account'

// A plain picture, drawn here so no photo file is committed. A PNG is enough:
// the page resizes whatever it is given into JPEG renditions.
function crc32(bytes: Buffer) {
  let crc = ~0
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function makePng(width: number, height: number) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  const rowBytes = width * 3
  const raw = Buffer.alloc((rowBytes + 1) * height) // filter byte 0 per row
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (rowBytes + 1) + 1 + x * 3
      raw[at] = (x * 255) / width
      raw[at + 1] = (y * 255) / height
      raw[at + 2] = 140
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
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

test('an admin adds a book with a photo, the shop shows it, then removes it', async ({
  page,
}) => {
  // Unique, so a leftover from an aborted run cannot be mistaken for this book.
  const title = `E2E kniha ${Date.now()}`

  await signIn(page)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Knihy' }),
  ).toBeVisible()

  // The settings page opens from the admin page. Read only: the checkout
  // tests depend on the settings the e2e reset script writes.
  await page.getByRole('link', { name: 'Nastavení' }).click()
  await expect(page).toHaveURL('/admin/settings')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nastavení obchodu' }),
  ).toBeVisible()
  await expect(page.getByLabel('Cena Zásilkovny (Kč)')).toBeVisible()
  await page.goto('/admin')

  // Add the book with one photo.
  await page.getByRole('link', { name: 'Přidat knihu' }).click()
  await expect(page).toHaveURL('/admin/books/new')
  await page.getByLabel('Název', { exact: true }).fill(title)
  await page.getByLabel('Autor', { exact: true }).fill('Testovací Autor')
  await page.getByLabel('Cena (Kč)').fill('150')
  await page.getByRole('radio', { name: 'Použitá' }).check()
  await page.getByLabel('Přidat fotky').setInputFiles({
    name: 'e2e.png',
    mimeType: 'image/png',
    buffer: makePng(600, 800),
  })
  await expect(page.getByText('Připraveno')).toBeVisible()
  await page.getByRole('button', { name: 'Uložit' }).click()

  // It is in the admin list, with its photo.
  await expect(page).toHaveURL('/admin')
  const row = page.getByRole('article').filter({ hasText: title })
  await expect(row).toBeVisible()
  await expect(row.getByText('Bez fotek')).toHaveCount(0)

  // The shop shows it, with a photo from the storage.
  await page.goto('/')
  const card = page.getByRole('article').filter({ hasText: title })
  await expect(card).toBeVisible()
  const image = card.locator('img')
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)

  // Clean up through the admin: hide, then delete.
  await page.goto('/admin')
  const adminRow = page.getByRole('article').filter({ hasText: title })
  await adminRow.getByRole('button', { name: 'Skrýt' }).click()
  await expect(adminRow.getByText('Skrytá')).toBeVisible()
  await adminRow.getByRole('button', { name: 'Smazat' }).click()
  await page.getByRole('button', { name: 'Ano, smazat' }).click()
  await expect(
    page.getByRole('article').filter({ hasText: title }),
  ).toHaveCount(0)
})
