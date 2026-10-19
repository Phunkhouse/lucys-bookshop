// A Cloudflare Worker that calls the shop's hourly job once an hour (spec 8).
// It is plain JavaScript so it can be pasted into the Cloudflare dashboard as it
// is: no build step, no dependency. Setup: docs/hourly-job.md.
//
// Settings, in the Worker (never in the repo):
//   SHOP_URL    the shop's public address, for example https://shop.example
//   JOBS_SECRET the same secret the shop has as JOBS_SECRET (a Worker secret)

// Waits between the attempts: three tries in all, about seven seconds apart in
// total. A scheduled run that cannot get through then fails and is visible.
export const RETRY_DELAYS_MS = [2000, 5000]
const ATTEMPT_TIMEOUT_MS = 30_000
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/**
 * The address the job is called at, or an error that names the setting. The
 * secret never travels in the clear: https, except for a local shop.
 * @param {string | undefined} shopUrl
 */
function jobUrl(shopUrl) {
  const trimmed = (shopUrl ?? '').trim().replace(/\/+$/, '')
  if (trimmed === '') throw new Error('SHOP_URL is not set')
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('SHOP_URL must be an address such as https://shop.example')
  }
  const local = LOCAL_HOSTS.includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error('SHOP_URL must start with https://')
  }
  return `${trimmed}/api/jobs/hourly`
}

/**
 * Calls the shop's hourly job. Resolves when the shop answers 200. Fails with
 * a message that never carries the secret or the shop's answer, so a failed run
 * shows up in Cloudflare without leaking anything into its logs.
 *
 * - A network error or a 5xx is tried again, after a short wait.
 * - Any other answer (a wrong secret, a wrong address) fails at once: it will
 *   not mend itself.
 *
 * @param {{ SHOP_URL?: string, JOBS_SECRET?: string }} env
 * @param {{ fetch?: typeof fetch, sleep?: (ms: number) => Promise<unknown> }} [deps]
 */
export async function callHourlyJob(env, deps = {}) {
  const send = deps.fetch ?? fetch
  const sleep =
    deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))

  const url = jobUrl(env.SHOP_URL)
  const secret = (env.JOBS_SECRET ?? '').trim()
  if (secret === '') throw new Error('JOBS_SECRET is not set')

  let failure = 'unknown error'
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await send(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      })
      if (response.ok) {
        console.log(`hourly job: ${await response.text()}`)
        return
      }
      failure = `status ${response.status}`
      if (response.status < 500) break
    } catch {
      failure = 'network error'
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt])
  }
  throw new Error(`Hourly job call failed: ${failure}`)
}

const worker = {
  /**
   * Runs on every cron tick. A thrown error marks the run as failed.
   * @param {unknown} _controller
   * @param {{ SHOP_URL?: string, JOBS_SECRET?: string }} env
   */
  async scheduled(_controller, env) {
    await callHourlyJob(env)
  },
}

export default worker
