# The hourly job

What calls the shop once an hour, and how to set it up. Everything here uses invented example values. Never put a real secret in the repo, in an issue, in a PR or in a chat.

## What it does

`POST /api/jobs/hourly` (ADR 0018, spec section 8) does two things:

- sends the seller **one reminder mail** for the unpaid orders whose reservation ends within 24 hours (once per order),
- **sends again** the new-order mails that failed the first time.

The shop does not call it itself. A **Cloudflare Worker** with a cron trigger calls it every hour at minute 17 (UTC). It costs nothing: the Workers Free plan allows 5 cron triggers per account, and this uses one. It does not depend on activity in the GitHub repository. GitHub's own scheduled workflows were rejected: they run only on the default branch, can start late, and are switched off in a public repository after 60 days without activity.

The endpoint answers only with counts, for example `{"retried":{"sent":0,"failed":0},"reminded":{"sent":1,"failed":0}}`. It is protected by a secret, `JOBS_SECRET`, sent as a bearer token. Without that secret on the shop, the endpoint is off (answers 503).

## Settings

| Where               | Name          | Value                                                       | Secret? |
| ------------------- | ------------- | ----------------------------------------------------------- | ------- |
| Vercel (Production) | `JOBS_SECRET` | At least 32 characters                                      | **Yes** |
| Cloudflare Worker   | `JOBS_SECRET` | **The same value** as in Vercel                             | **Yes** |
| Cloudflare Worker   | `SHOP_URL`    | The shop's public address, `https://...`, no trailing slash | No      |

Leave `JOBS_SECRET` unset in Vercel **Preview**, so preview deployments have the endpoint switched off. Locally it can stay empty too.

A `JOBS_SECRET` shorter than 32 characters stops the shop from starting, like `BETTER_AUTH_SECRET`: a typo fails loudly at deploy. Whitespace around a value (a newline pasted along with it) is ignored on both sides.

## One-time setup

The names of menus in the Cloudflare dashboard change now and then; the steps are the same.

1. **Make the secret** on your computer and keep it in a password manager:

   ```bash
   openssl rand -base64 32
   ```

2. **Vercel:** Project, Settings, Environment Variables. Add `JOBS_SECRET` for **Production** only. Redeploy, because a setting is read at deploy time.
3. **Cloudflare, create the Worker:** Workers & Pages, Create, Create Worker. Name it `lucys-bookshop-hourly-job` and deploy the example. Then Edit code, replace everything with the contents of [`workers/hourly-job/index.js`](../workers/hourly-job/index.js), and deploy.
4. **Cloudflare, settings of the Worker:** Settings, Variables and secrets. Add `SHOP_URL` as **Text** and `JOBS_SECRET` as **Secret** (the same value as in Vercel). Deploy.
5. **Cloudflare, the trigger:** Settings, Triggers, Cron Triggers. Add `17 * * * *`. A change can take up to 15 minutes to take effect.

With the command line instead of the dashboard, from `workers/hourly-job/` (nothing is added to the project). Pick one way and keep to it: a deploy with wrangler can overwrite settings made in the dashboard.

1. Add the shop's address to `wrangler.toml` (it is not a secret):

   ```toml
   [vars]
   SHOP_URL = "https://shop.example"
   ```

2. Deploy and set the secret:

   ```bash
   pnpm dlx wrangler deploy
   pnpm dlx wrangler secret put JOBS_SECRET
   ```

The cron trigger comes from `wrangler.toml`.

## Checking that it works

After the next `:17`:

- **Vercel, Logs:** a `POST /api/jobs/hourly` with status 200.
- **Cloudflare, the Worker's logs:** a line `hourly job: {...}` with the counts. A failed run shows as an error.

If you want to be sure straight away, the Worker's editor in the dashboard can fire the scheduled event by hand.

## When a run fails

The Worker tries three times (about seven seconds apart in total) after a network error or a 5xx answer. After a 401, 403, 404 or 405 it stops at once, because it will not mend itself. The error says only the status, never the secret or the shop's answer.

| Status  | Usual cause                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------- |
| 401     | The secret differs between Vercel and the Worker. Set the same value in both.                   |
| 404/405 | `SHOP_URL` points to the wrong place, or the deployment does not have the endpoint yet.         |
| 503     | `JOBS_SECRET` is not set in Vercel Production, or the shop was not redeployed after setting it. |
| 5xx     | The shop itself is down or the database is unreachable. The next run tries again.               |

To change the secret, put the new value in **both** places. Nothing else changes.

## If it stops

New-order mail does not depend on the job: it goes out right after checkout. What stops is the 24-hour reminder and the retry of a failed first mail. The "Brzy vyprší" flag in the admin orders list is computed when the page opens and keeps working, so an order about to expire is still visible there.

More on Cloudflare: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
