import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { callHourlyJob, RETRY_DELAYS_MS } from './index.js'

const SECRET = 'a-job-secret-of-at-least-thirty-two-characters'
const env = { SHOP_URL: 'https://shop.example', JOBS_SECRET: SECRET }

const counts = {
  retried: { sent: 0, failed: 0 },
  reminded: { sent: 1, failed: 0 },
}
const ok = () => Promise.resolve(Response.json(counts))
const status =
  (code: number, body = '{}') =>
  () =>
    Promise.resolve(new Response(body, { status: code }))

// A sleep that does not wait, and remembers how long it was asked to.
function sleeper() {
  const delays: number[] = []
  return {
    delays,
    sleep: (ms: number) => {
      delays.push(ms)
      return Promise.resolve()
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('callHourlyJob: the call', () => {
  it('posts to the job endpoint with the secret as a bearer token', async () => {
    const fetch = vi.fn(ok)

    await callHourlyJob(env, { fetch, sleep: sleeper().sleep })

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://shop.example/api/jobs/hourly')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${SECRET}`,
    )
  })

  it('gives every attempt a time limit', async () => {
    const fetch = vi.fn(ok)

    await callHourlyJob(env, { fetch, sleep: sleeper().sleep })

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('logs the counts the shop answered with', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await callHourlyJob(env, { fetch: ok, sleep: sleeper().sleep })

    expect(String(log.mock.calls.flat().join(' '))).toContain('"sent":1')
  })

  // Settings pages and copy and paste add stray whitespace and slashes.
  it('ignores whitespace around the settings and slashes at the end of the address', async () => {
    const fetch = vi.fn(ok)

    await callHourlyJob(
      { SHOP_URL: '  https://shop.example//\n', JOBS_SECRET: `\n${SECRET} ` },
      { fetch, sleep: sleeper().sleep },
    )

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://shop.example/api/jobs/hourly')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${SECRET}`,
    )
  })
})

describe('callHourlyJob: settings', () => {
  it.each([
    ['SHOP_URL', { JOBS_SECRET: SECRET }],
    ['SHOP_URL', { SHOP_URL: '  ', JOBS_SECRET: SECRET }],
    ['JOBS_SECRET', { SHOP_URL: 'https://shop.example' }],
    ['JOBS_SECRET', { SHOP_URL: 'https://shop.example', JOBS_SECRET: '' }],
  ])(
    'names %s when it is missing, and calls nothing',
    async (name, partial) => {
      const fetch = vi.fn(ok)

      await expect(
        callHourlyJob(partial, { fetch, sleep: sleeper().sleep }),
      ).rejects.toThrow(new RegExp(name))
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  // The secret must never travel in the clear.
  it.each([
    'http://shop.example',
    'ftp://shop.example',
    'shop.example',
    'not a url',
  ])('refuses the address %j and calls nothing', async (SHOP_URL) => {
    const fetch = vi.fn(ok)

    await expect(
      callHourlyJob(
        { SHOP_URL, JOBS_SECRET: SECRET },
        { fetch, sleep: sleeper().sleep },
      ),
    ).rejects.toThrow(/SHOP_URL/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('allows plain http for a local shop, to try the Worker with wrangler dev', async () => {
    const fetch = vi.fn(ok)

    await callHourlyJob(
      { SHOP_URL: 'http://localhost:3000', JOBS_SECRET: SECRET },
      { fetch, sleep: sleeper().sleep },
    )

    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('callHourlyJob: when the call fails', () => {
  it('tries again after a server error, waiting between the attempts', async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(status(502))
      .mockImplementationOnce(status(500))
      .mockImplementationOnce(ok)
    const { delays, sleep } = sleeper()

    await callHourlyJob(env, { fetch, sleep })

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(delays).toEqual(RETRY_DELAYS_MS)
  })

  it('tries again after a network error', async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('socket hang up')))
      .mockImplementationOnce(ok)

    await callHourlyJob(env, { fetch, sleep: sleeper().sleep })

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gives up after the last attempt and fails, so the run shows as failed', async () => {
    const fetch = vi.fn(status(503))

    await expect(
      callHourlyJob(env, { fetch, sleep: sleeper().sleep }),
    ).rejects.toThrow(/503/)
    expect(fetch).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1)
  })

  it('fails after the last attempt on a network error too', async () => {
    const fetch = vi.fn(() => Promise.reject(new Error('socket hang up')))

    await expect(
      callHourlyJob(env, { fetch, sleep: sleeper().sleep }),
    ).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1)
  })

  // A wrong secret or address will not mend itself: fail at once, loudly.
  it.each([401, 403, 404, 405])(
    'does not try again after %s, and fails at once',
    async (code) => {
      const fetch = vi.fn(status(code))
      const { delays, sleep } = sleeper()

      await expect(callHourlyJob(env, { fetch, sleep })).rejects.toThrow(
        new RegExp(String(code)),
      )
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(delays).toEqual([])
    },
  )

  it('never puts the secret or the answer body into an error', async () => {
    const fetch = vi.fn(
      status(401, JSON.stringify({ error: `bad ${SECRET} token` })),
    )

    const failure = await callHourlyJob(env, {
      fetch,
      sleep: sleeper().sleep,
    }).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(Error)
    expect(String((failure as Error).message)).not.toContain(SECRET)
    expect(String((failure as Error).message)).not.toContain('token')
  })

  it('never puts the secret into an error when the network fails', async () => {
    const fetch = vi.fn(() =>
      Promise.reject(new Error(`request with ${SECRET} failed`)),
    )

    const failure = await callHourlyJob(env, {
      fetch,
      sleep: sleeper().sleep,
    }).then(
      () => null,
      (error: unknown) => error,
    )

    expect(String(failure)).not.toContain(SECRET)
  })
})

describe('the Worker entry point', () => {
  it('runs the call on every scheduled tick', async () => {
    const fetch = vi.fn(ok)
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await worker.scheduled({}, env)

    expect(fetch).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('lets a failure out, so Cloudflare marks the run as failed', async () => {
    vi.stubGlobal('fetch', vi.fn(status(401)))

    await expect(worker.scheduled({}, env)).rejects.toThrow(/401/)
    vi.unstubAllGlobals()
  })
})
