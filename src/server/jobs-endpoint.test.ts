import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleJobsRequest } from './jobs-endpoint'
import type { HourlyJobsResult } from './hourly-jobs'

const secret = 'a-job-secret-of-at-least-thirty-two-characters'

const counts: HourlyJobsResult = {
  retried: { sent: 1, failed: 0 },
  reminded: { sent: 2, failed: 1 },
}

function request(authorization?: string) {
  return new Request('https://shop.example/api/jobs/hourly', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

afterEach(() => vi.restoreAllMocks())

describe('handleJobsRequest', () => {
  it('runs the job once and answers with the counts for the right secret', async () => {
    const run = vi.fn().mockResolvedValue(counts)

    const response = await handleJobsRequest(request(`Bearer ${secret}`), {
      secret,
      run,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      retried: { sent: 1, failed: 0 },
      reminded: { sent: 2, failed: 1 },
    })
    expect(run).toHaveBeenCalledTimes(1)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    ['no header', undefined],
    ['a wrong secret', 'Bearer not-the-secret-not-the-secret-not-the-secret'],
    ['no scheme', secret],
  ])('answers 401 and does nothing for %s', async (_label, header) => {
    const run = vi.fn()

    const response = await handleJobsRequest(request(header), { secret, run })

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toMatch(/^Bearer/)
    expect(run).not.toHaveBeenCalled()
  })

  it('answers 503 and does nothing when the server has no secret', async () => {
    const run = vi.fn()

    for (const header of [undefined, `Bearer ${secret}`, 'Bearer ']) {
      const response = await handleJobsRequest(request(header), {
        secret: undefined,
        run,
      })
      expect(response.status).toBe(503)
    }
    expect(run).not.toHaveBeenCalled()
  })

  it('says nothing about the secret in any answer', async () => {
    const run = vi.fn().mockResolvedValue(counts)
    const answers = [
      await handleJobsRequest(request('Bearer nope'), { secret, run }),
      await handleJobsRequest(request(), { secret: undefined, run }),
      await handleJobsRequest(request(`Bearer ${secret}`), { secret, run }),
    ]

    for (const response of answers) {
      expect(await response.text()).not.toContain(secret)
    }
  })

  // A step that could not even run (the database is down) must make the call
  // fail, so the caller notices. Failed mails are counted, not an error: the
  // next run sends them again.
  it('answers 500 when a step could not run, without details', async () => {
    const run = vi.fn().mockResolvedValue({
      retried: { sent: 0, failed: 0, error: true },
      reminded: { sent: 0, failed: 0 },
    } satisfies HourlyJobsResult)

    const response = await handleJobsRequest(request(`Bearer ${secret}`), {
      secret,
      run,
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'job_failed' })
  })

  it('answers 500 without details when the job throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi
      .fn()
      .mockRejectedValue(new Error('connection to db-secret-host refused'))

    const response = await handleJobsRequest(request(`Bearer ${secret}`), {
      secret,
      run,
    })

    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).not.toContain('db-secret-host')
    expect(JSON.parse(text)).toEqual({ error: 'job_failed' })
  })
})
