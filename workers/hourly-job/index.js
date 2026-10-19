// A Cloudflare Worker with two cron triggers (spec 8). Once an hour it calls the
// shop's hourly job; once a day it asks GitHub to run the backup workflow (ADR
// 0021). It is plain JavaScript so it can be pasted into the Cloudflare dashboard
// as it is: no build step, no dependency. Setup: docs/hourly-job.md, docs/backup.md.
//
// Settings, in the Worker (never in the repo):
//   SHOP_URL     the shop's public address, for example https://shop.example
//   JOBS_SECRET  the same secret the shop has as JOBS_SECRET (a Worker secret)
//   GITHUB_TOKEN a fine-grained token that may only run workflows of one
//                repository (a Worker secret)
//   BACKUP_REPO  owner/name of that repository (in wrangler.toml, not secret)

// Waits between the attempts: three tries in all, about seven seconds apart in
// total. A scheduled run that cannot get through then fails and is visible.
export const RETRY_DELAYS_MS = [2000, 5000]
// Longer than the shop's own limit for this job (60 s, maxDuration of its route),
// so a slow run is waited for and never answered by a second, overlapping one.
export const ATTEMPT_TIMEOUT_MS = 65_000
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

// Worth another try: the server is down or slow (5xx), or something in front of
// it said "too slow" or "too many" (408, 429). A wrong secret or address is not.
const isRetriable = (status) =>
  status >= 500 || status === 408 || status === 429

/**
 * Sends a request, trying again after a short wait. Resolves with the first ok
 * answer. Fails with a message that never carries a secret or the answer's body,
 * so a failed run shows up in Cloudflare without leaking anything into its logs.
 *
 * - A network error, a 5xx, a 408 or a 429 is tried again, after a short wait.
 * - Any other answer (a wrong secret, a wrong address) fails at once: it will
 *   not mend itself.
 *
 * @param {{ send: typeof fetch, sleep: (ms: number) => Promise<unknown>, url: string, init: () => RequestInit, label: string }} request
 * @returns {Promise<Response>}
 */
async function sendWithRetries({ send, sleep, url, init, label }) {
  let failure = 'unknown error'
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let response
    try {
      response = await send(url, init())
    } catch {
      failure = 'network error'
    }

    if (response?.ok) return response

    if (response) {
      failure = `status ${response.status}`
      // Let go of the body so no connection is left waiting.
      await response.body?.cancel().catch(() => {})
      if (!isRetriable(response.status)) break
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt])
  }
  throw new Error(`${label} failed: ${failure}`)
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Calls the shop's hourly job. Resolves when the shop answers 200.
 *
 * @param {{ SHOP_URL?: string, JOBS_SECRET?: string }} env
 * @param {{ fetch?: typeof fetch, sleep?: (ms: number) => Promise<unknown> }} [deps]
 */
export async function callHourlyJob(env, deps = {}) {
  const url = jobUrl(env.SHOP_URL)
  const secret = (env.JOBS_SECRET ?? '').trim()
  if (secret === '') throw new Error('JOBS_SECRET is not set')

  const response = await sendWithRetries({
    send: deps.fetch ?? fetch,
    sleep: deps.sleep ?? defaultSleep,
    url,
    init: () => ({
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    }),
    label: 'Hourly job call',
  })

  // The job has run. Reading what it says is only for the log, so a failure here
  // must never make this call it again.
  try {
    console.log(`hourly job: ${await response.text()}`)
  } catch {
    console.log('hourly job: done (the answer could not be read)')
  }
}

// The cron expression of the daily backup, as in wrangler.toml. The Worker tells
// the two jobs apart by it.
export const BACKUP_CRON = '41 2 * * *'
const GITHUB_API = 'https://api.github.com'
const BACKUP_WORKFLOW_FILE = 'backup.yml'
const BACKUP_BRANCH = 'main'
// GitHub answers quickly; a minute is plenty and keeps a hung call from eating
// the run.
const GITHUB_TIMEOUT_MS = 30_000

/**
 * The repository as it goes into the address, or an error that names the setting.
 * Strictly owner/name, so a stray character cannot change where the call goes.
 * @param {string | undefined} repo
 */
function repoPath(repo) {
  const trimmed = (repo ?? '').trim()
  const parts = trimmed.split('/')
  const valid =
    parts.length === 2 &&
    parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && !/^\.+$/.test(part))
  if (!valid) throw new Error('BACKUP_REPO must look like owner/name')
  return trimmed
}

/**
 * Asks GitHub to run the backup workflow (workflow_dispatch). Resolves when
 * GitHub accepts the request (204, or 200 with the run id). That the backup
 * itself works is reported by the workflow, not here.
 *
 * @param {{ GITHUB_TOKEN?: string, BACKUP_REPO?: string }} env
 * @param {{ fetch?: typeof fetch, sleep?: (ms: number) => Promise<unknown> }} [deps]
 */
export async function dispatchBackup(env, deps = {}) {
  const token = (env.GITHUB_TOKEN ?? '').trim()
  if (token === '') throw new Error('GITHUB_TOKEN is not set')
  const repo = repoPath(env.BACKUP_REPO)

  await sendWithRetries({
    send: deps.fetch ?? fetch,
    sleep: deps.sleep ?? defaultSleep,
    url: `${GITHUB_API}/repos/${repo}/actions/workflows/${BACKUP_WORKFLOW_FILE}/dispatches`,
    init: () => ({
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'lucys-bookshop-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: BACKUP_BRANCH }),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    }),
    label: 'Backup dispatch',
  })
  console.log('backup dispatched')
}

const worker = {
  /**
   * Runs on every cron tick. A thrown error marks the run as failed. The daily
   * cron starts the backup; any other tick is the hourly job.
   * @param {{ cron?: string }} controller
   * @param {{ SHOP_URL?: string, JOBS_SECRET?: string, GITHUB_TOKEN?: string, BACKUP_REPO?: string }} env
   */
  async scheduled(controller, env) {
    if (controller?.cron === BACKUP_CRON) {
      await dispatchBackup(env)
    } else {
      await callHourlyJob(env)
    }
  },
}

export default worker
