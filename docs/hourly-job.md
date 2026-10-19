# The hourly job

What calls the shop once an hour, and how to set it up. Everything here uses invented example values. Never put a real secret in the repo, in an issue, in a PR or in a chat.

## What it does

`POST /api/jobs/hourly` (ADR 0018, spec section 8) does two things:

- sends the seller **one reminder mail** for the unpaid orders whose reservation ends within 24 hours (once per order),
- **sends again** the new-order mails that failed the first time.

The shop does not call it itself. A **Cloudflare Worker** with a cron trigger calls it every hour at minute 17 (UTC). It costs nothing: the Workers Free plan allows 5 cron triggers per account, and this uses one. It does not depend on activity in the GitHub repository. GitHub's own scheduled workflows were rejected: they run only on the default branch, can start late, and are switched off in a public repository after 60 days without activity.

The endpoint answers only with counts, for example `{"retried":{"sent":0,"failed":0},"reminded":{"sent":1,"failed":0}}`. It is protected by a secret, `JOBS_SECRET`, sent as a bearer token. Without that secret on the shop, the endpoint is off (answers 503).

## Settings

| Where               | Name          | Value                                                       | Secret?                             |
| ------------------- | ------------- | ----------------------------------------------------------- | ----------------------------------- |
| Vercel (Production) | `JOBS_SECRET` | At least 32 characters                                      | **Yes**                             |
| Cloudflare Worker   | `JOBS_SECRET` | **The same value** as in Vercel                             | **Yes**                             |
| Cloudflare Worker   | `SHOP_URL`    | The shop's public address, `https://...`, no trailing slash | No, but set as a secret (see below) |

Leave `JOBS_SECRET` unset in Vercel **Preview**, so preview deployments have the endpoint switched off. Locally it can stay empty too.

A `JOBS_SECRET` shorter than 32 characters stops the shop from starting, like `BETTER_AUTH_SECRET`: a typo fails loudly at deploy. Whitespace around a value (a newline pasted along with it) is ignored on both sides.

## One-time setup

1. **Make the secret** on your computer and keep it in a password manager:

   ```bash
   openssl rand -base64 32
   ```

2. **Vercel:** Project, Settings, Environment Variables. Add `JOBS_SECRET` for **Production** only. Redeploy, because a setting is read at deploy time.
3. **Cloudflare, with the command line** (recommended). From the project folder:

   ```bash
   cd workers/hourly-job
   pnpm dlx wrangler login
   ```

   `wrangler login` opens your browser: sign in to Cloudflare and choose **Allow**. Nothing is installed in the project.

4. **Deploy.** This creates the Worker and its cron trigger (`17 * * * *`, from `wrangler.toml`):

   ```bash
   pnpm dlx wrangler deploy
   ```

5. **Set the two settings.** Wrangler asks for each value and hides what you type. First the shop's public address, then the secret, the same value as in Vercel:

   ```bash
   pnpm dlx wrangler secret put SHOP_URL
   pnpm dlx wrangler secret put JOBS_SECRET
   ```

   The address is not really a secret, but a secret is kept across deploys and nothing in the project has to be edited, so it is the simplest way. Until both are set, a run fails with a message naming the missing one. That is expected for the first minutes.

6. **Check the cron trigger** in the dashboard: Workers & Pages, the Worker `lucys-bookshop-hourly-job`, Settings, Triggers, Cron Triggers. `17 * * * *` should be listed. A change to a trigger can take up to 15 minutes to take effect.

To change the address or the secret later, run the matching `secret put` command again. Do not mix this with settings made by hand in the dashboard.

Cloudflare has been changing its dashboard. Creating the Worker there is possible too (Workers & Pages, Create, start from a template, replace its code with [`workers/hourly-job/index.js`](../workers/hourly-job/index.js), add the two settings under Settings, Variables and Secrets, and the cron trigger under Settings, Triggers), but the menu names move, so the command line is the reliable way.

## Checking that it works

After the next `:17`:

- **Vercel, Logs:** a `POST /api/jobs/hourly` with status 200.
- **Cloudflare, the Worker's logs:** a line `hourly job: {...}` with the counts. A failed run shows as an error.

If you want to be sure straight away, the Worker's editor in the dashboard can fire the scheduled event by hand.

## When a run fails

The Worker tries three times (about seven seconds apart in total) after a network error, a 5xx, a 408 or a 429. After any other answer, such as a 401, 403, 404 or 405, it stops at once, because it will not mend itself. Each try waits up to 65 seconds, a little longer than the shop's own 60-second limit for the job, so a slow run is never answered by a second one. The error says only the status, never the secret or the shop's answer.

| Status  | Usual cause                                                                                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401     | The secret differs between Vercel and the Worker. Set the same value in both.                                                                                                                                                           |
| 404/405 | `SHOP_URL` points to the wrong place, the deployment does not have the endpoint yet, or the address redirects (for example http to https, or no-www to www): a redirect turns the POST into a GET, which the endpoint refuses with 405. |
| 503     | `JOBS_SECRET` is not set in Vercel Production, or the shop was not redeployed after setting it. The Worker tries this three times too, then fails.                                                                                      |
| 5xx     | The shop itself is down or the database is unreachable. The next run tries again.                                                                                                                                                       |

To change the secret, put the new value in **both** places. Nothing else changes.

## If it stops

New-order mail does not depend on the job: it goes out right after checkout. What stops is the 24-hour reminder and the retry of a failed first mail. The "Brzy vyprší" flag in the admin orders list is computed when the page opens and keeps working, so an order about to expire is still visible there.

More on Cloudflare: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
