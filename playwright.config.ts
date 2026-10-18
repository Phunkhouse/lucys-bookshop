import { defineConfig, devices } from '@playwright/test'
import { TEST_IBAN } from './src/server/test-iban'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // The seller's account for the QR code on the order page: a made-up one,
    // built at run time. A server that was already running keeps its own.
    env: { SELLER_IBAN: TEST_IBAN },
    timeout: 120_000,
  },
})
