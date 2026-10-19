import { expect, test } from '@playwright/test'
import { E2E_JOBS_SECRET } from './jobs-fixtures'

// The hourly job endpoint (spec 8): called by a scheduler, never by a browser.
const URL = '/api/jobs/hourly'

test.describe('hourly job endpoint', () => {
  test('refuses a call without the secret, or with a wrong one', async ({
    request,
  }) => {
    const none = await request.post(URL)
    expect(none.status(), await none.text()).toBe(401)

    const wrong = await request.post(URL, {
      headers: { Authorization: 'Bearer not-the-secret-not-the-secret-xxxxx' },
    })
    expect(wrong.status(), await wrong.text()).toBe(401)
    expect(await wrong.text()).not.toContain(E2E_JOBS_SECRET)
  })

  test('refuses anything but POST', async ({ request }) => {
    const get = await request.get(URL, {
      headers: { Authorization: `Bearer ${E2E_JOBS_SECRET}` },
    })

    expect(get.status(), await get.text()).toBe(405)
  })

  test('runs the job for the right secret and answers with counts only', async ({
    request,
  }) => {
    const response = await request.post(URL, {
      headers: { Authorization: `Bearer ${E2E_JOBS_SECRET}` },
    })

    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toBe('no-store')
    expect(await response.json()).toEqual({
      retried: {
        sent: expect.any(Number),
        failed: expect.any(Number),
      },
      reminded: {
        sent: expect.any(Number),
        failed: expect.any(Number),
      },
    })
  })
})
