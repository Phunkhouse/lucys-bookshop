import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, {
  BACKUP_CRON,
  dispatchBackup,
  RETRY_DELAYS_MS,
} from './index.js'

const TOKEN = 'github_pat_EXAMPLE_not_a_real_token_0123456789'
const env = { GITHUB_TOKEN: TOKEN, BACKUP_REPO: 'example-owner/example-repo' }

const accepted = () => Promise.resolve(new Response(null, { status: 204 }))
const status =
  (code: number, body = '{"message":"nope"}') =>
  () =>
    Promise.resolve(new Response(body, { status: code }))

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

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('dispatchBackup: the call', () => {
  it('asks GitHub to run the backup workflow on main', async () => {
    const fetch = vi.fn(accepted)

    await dispatchBackup(env, { fetch, sleep: sleeper().sleep })

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.github.com/repos/example-owner/example-repo/actions/workflows/backup.yml/dispatches',
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main' })
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(headers.Accept).toBe('application/vnd.github+json')
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28')
    // GitHub refuses requests without a User-Agent.
    expect(headers['User-Agent']).toBeTruthy()
  })

  it('accepts 200 (a run id in the answer) as well as 204', async () => {
    const ok = () => Promise.resolve(Response.json({ workflow_run_id: 1 }))
    await expect(
      dispatchBackup(env, { fetch: vi.fn(ok), sleep: sleeper().sleep }),
    ).resolves.toBeUndefined()
  })

  it('ignores whitespace around the settings', async () => {
    const fetch = vi.fn(accepted)
    await dispatchBackup(
      {
        GITHUB_TOKEN: `  ${TOKEN}\n`,
        BACKUP_REPO: ' example-owner/example-repo ',
      },
      { fetch, sleep: sleeper().sleep },
    )
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/repos/example-owner/example-repo/')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    )
  })

  it('gives the attempt a time limit', async () => {
    const fetch = vi.fn(accepted)
    await dispatchBackup(env, { fetch, sleep: sleeper().sleep })
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('dispatchBackup: settings', () => {
  it('fails, naming the setting, when the token is missing', async () => {
    const fetch = vi.fn(accepted)
    await expect(
      dispatchBackup({ BACKUP_REPO: env.BACKUP_REPO }, { fetch }),
    ).rejects.toThrow(/GITHUB_TOKEN is not set/)
    await expect(
      dispatchBackup({ ...env, GITHUB_TOKEN: '  ' }, { fetch }),
    ).rejects.toThrow(/GITHUB_TOKEN is not set/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails when the repository is missing or is not owner/name', async () => {
    const fetch = vi.fn(accepted)
    for (const repo of [
      undefined,
      '',
      'no-slash',
      'a/b/c',
      '../etc',
      'owner/repo?x=1',
      'owner/repo#frag',
      'owner/re po',
      'https://evil.example/x',
    ]) {
      await expect(
        dispatchBackup({ ...env, BACKUP_REPO: repo }, { fetch }),
      ).rejects.toThrow(/BACKUP_REPO/)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('only ever talks to api.github.com', async () => {
    const fetch = vi.fn(accepted)
    await dispatchBackup(env, { fetch, sleep: sleeper().sleep })
    const [url] = fetch.mock.calls[0] as unknown as [string]
    expect(new URL(url).origin).toBe('https://api.github.com')
  })
})

describe('dispatchBackup: when the call fails', () => {
  it('tries again after a server error, a 429, a 408 and a network error', async () => {
    for (const first of [
      status(500),
      status(502),
      status(429),
      status(408),
      () => Promise.reject(new Error('boom')),
    ]) {
      const fetch = vi
        .fn()
        .mockImplementationOnce(first)
        .mockImplementation(accepted)
      const { delays, sleep } = sleeper()

      await dispatchBackup(env, { fetch, sleep })

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(delays).toEqual([RETRY_DELAYS_MS[0]])
    }
  })

  it('fails at once on an answer that will not mend itself', async () => {
    for (const code of [401, 403, 404, 422]) {
      const fetch = vi.fn(status(code))
      await expect(
        dispatchBackup(env, { fetch, sleep: sleeper().sleep }),
      ).rejects.toThrow(new RegExp(`${code}`))
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })

  it('gives up after the last attempt, so the run shows as failed', async () => {
    const fetch = vi.fn(status(503))
    const { delays, sleep } = sleeper()

    await expect(dispatchBackup(env, { fetch, sleep })).rejects.toThrow(
      /Backup dispatch failed: status 503/,
    )
    expect(fetch).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1)
    expect(delays).toEqual(RETRY_DELAYS_MS)
  })

  it('never puts the token or the answer into an error', async () => {
    for (const fetch of [
      vi.fn(status(401, `{"message":"Bad credentials ${TOKEN}"}`)),
      vi.fn(() => Promise.reject(new Error(`failed with ${TOKEN}`))),
    ]) {
      const error = await dispatchBackup(env, {
        fetch,
        sleep: sleeper().sleep,
      }).catch((e: Error) => e)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).not.toContain(TOKEN)
      expect((error as Error).message).not.toContain('Bad credentials')
    }
  })
})

describe('the Worker entry point and the backup', () => {
  it('has a daily time of its own, away from the top of the hour', () => {
    expect(BACKUP_CRON).toBe('41 2 * * *')
  })

  it('dispatches the backup on its cron and does not call the shop', async () => {
    const fetch = vi.fn(accepted)
    vi.stubGlobal('fetch', fetch)

    await worker.scheduled(
      { cron: BACKUP_CRON },
      { ...env, SHOP_URL: 'https://shop.example', JOBS_SECRET: 'x'.repeat(40) },
    )

    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toContain(
      'api.github.com',
    )
  })

  it('still calls the hourly job on any other cron', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({})))
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await worker.scheduled(
      { cron: '17 * * * *' },
      { ...env, SHOP_URL: 'https://shop.example', JOBS_SECRET: 'x'.repeat(40) },
    )

    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://shop.example/api/jobs/hourly',
    )
  })

  it('lets a failed dispatch out, so Cloudflare marks the run as failed', async () => {
    vi.stubGlobal('fetch', vi.fn(status(401)))

    await expect(worker.scheduled({ cron: BACKUP_CRON }, env)).rejects.toThrow(
      /401/,
    )
  })
})
