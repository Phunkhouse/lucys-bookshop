import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleBackupReport } from './backup-report-endpoint'

const secret = 'a-backup-secret-of-at-least-thirty-two-characters'
const now = new Date('2026-10-20T02:50:00.000Z')

function request(authorization?: string, body?: string) {
  return new Request('https://shop.example/api/jobs/backup-report', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
    body,
  })
}

afterEach(() => vi.restoreAllMocks())

describe('handleBackupReport', () => {
  it('records the backup for the right secret, at the server time', async () => {
    const record = vi.fn().mockResolvedValue(undefined)

    const response = await handleBackupReport(request(`Bearer ${secret}`), {
      secret,
      record,
      now: () => now,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(now)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('ignores a time sent by the caller: a backup cannot be backdated or made up', async () => {
    const record = vi.fn().mockResolvedValue(undefined)

    await handleBackupReport(
      request(
        `Bearer ${secret}`,
        JSON.stringify({ at: '2030-01-01T00:00:00Z' }),
      ),
      { secret, record, now: () => now },
    )

    expect(record).toHaveBeenCalledWith(now)
  })

  it.each([
    ['no header', undefined],
    ['a wrong secret', 'Bearer not-the-secret'],
    ['another scheme', `Basic ${secret}`],
    ['an empty bearer', 'Bearer '],
  ])('refuses %s and records nothing', async (_name, authorization) => {
    const record = vi.fn()

    const response = await handleBackupReport(request(authorization), {
      secret,
      record,
      now: () => now,
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(record).not.toHaveBeenCalled()
  })

  it('is switched off without a configured secret, whatever is sent', async () => {
    const record = vi.fn()

    for (const header of [undefined, 'Bearer ', 'Bearer undefined']) {
      const response = await handleBackupReport(request(header), {
        secret: undefined,
        record,
        now: () => now,
      })
      expect(response.status).toBe(503)
    }
    expect(record).not.toHaveBeenCalled()
  })

  it('answers 500, without the reason, when recording fails, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const record = vi.fn().mockRejectedValue(new Error('secret-detail-from-db'))

    const response = await handleBackupReport(request(`Bearer ${secret}`), {
      secret,
      record,
      now: () => now,
    })

    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('secret-detail-from-db')
    expect(log).toHaveBeenCalled()
  })
})
