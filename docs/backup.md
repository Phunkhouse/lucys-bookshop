# Backups

How the production database is copied every day, where the copies are, and how to restore one (ADR 0021). Everything here uses invented example values. Never put a real key, token or database address in the repo, in an issue, in a PR or in a chat.

## What happens

Once a day a Cloudflare Worker asks GitHub to run the workflow `.github/workflows/backup.yml`. The workflow:

1. dumps the production database with `pg_dump`, through a **read-only** database role,
2. encrypts the dump with `age` and the **public** key, so the job cannot read it back,
3. uploads it to a private R2 bucket as `daily/YYYY-MM-DD/lucys-bookshop-<UTC time>.dump.age`, and checks that the stored size matches,
4. tells the shop (`POST /api/jobs/backup-report`). The shop records the time, and the admin shows a warning at the top of the books and orders pages when the last report is older than 36 hours, or when none has ever arrived.

The repository is public, so the dump is never an artifact and never leaves the runner unencrypted. Only the private key can read a backup. It is in two places owned by the developer (a password manager, and a second copy somewhere independent) and **nowhere else**: not in GitHub, not in Cloudflare, not in the repo.

The bucket `lucys-bookshop-backups` (location hint in Europe, no jurisdiction, so the default R2 address) has a lock rule that stops deleting anything under `daily/` for 30 days and a lifecycle rule that removes objects after 35 days. So about 30 daily copies exist at any time. R2's free tier (10 GB-month) is far more than a small shop's dump needs.

Neon's own history on the free plan is only 6 hours. This backup is the real safety net.

## Settings

| Where           | Name                   | Value                                  | Secret? |
| --------------- | ---------------------- | -------------------------------------- | ------- |
| GitHub secret   | `BACKUP_DATABASE_URL`  | direct Neon address of `backup_reader` | **Yes** |
| GitHub secret   | `R2_ACCESS_KEY_ID`     | token scoped to the backup bucket      | **Yes** |
| GitHub secret   | `R2_SECRET_ACCESS_KEY` | its secret                             | **Yes** |
| GitHub variable | `R2_ACCOUNT_ID`        | Cloudflare account id                  | No      |
| GitHub variable | `R2_BUCKET`            | `lucys-bookshop-backups`               | No      |
| GitHub variable | `AGE_PUBLIC_KEY`       | the `age1...` line                     | No      |

`BACKUP_DATABASE_URL` is the **direct** address (no `-pooler` in the host) with `?sslmode=require`. `pg_dump` does not work through the pooler.

The database role is made once, in the Neon SQL editor, with SQL, not with the console's "Add role" button (roles made there can write):

```sql
CREATE ROLE backup_reader WITH LOGIN PASSWORD '<a long random password>';
GRANT pg_read_all_data TO backup_reader;
```

## The warning in the admin

`BACKUP_REPORT_SECRET` is a different secret from `JOBS_SECRET` on purpose: GitHub holds this one, and with it someone can only record that a backup happened, never send mail. Make it with `openssl rand -base64 32`, keep it in the password manager, and set it in **Vercel (Production only) and as a GitHub repository secret**, then redeploy. Leave it unset in Preview. Also add the variable `SHOP_URL` to GitHub (**Variables**), with the shop's `https://` address.

Until `BACKUP_REPORT_SECRET` is set in Vercel, the endpoint answers 503 and the warning is off. Once it is set, the warning shows "never" until the first backup reports, then clears. If the workflow's last step fails with 401, the two values differ; with 503, Vercel has not been redeployed since the secret was set; with 404 or 405, `SHOP_URL` is wrong or redirects (for example http to https, or no-www to www).

The time is the shop's own clock when the report arrives, so the caller cannot backdate a backup. The warning only says that the workflow finished its last step. It does not prove the data can be restored: see "Practise it" below.

## The trigger (Cloudflare Worker)

The Worker in `workers/hourly-job/` (the one that calls the hourly job) has a second cron trigger, `41 2 * * *` (02:41 UTC, 03:41 or 04:41 in Prague). It sends `POST /repos/<BACKUP_REPO>/actions/workflows/backup.yml/dispatches` with `{"ref":"main"}` and a fine-grained GitHub token. It retries after a network error, a 5xx, a 408 or a 429, like the hourly job, and fails at once on anything else (a bad token, 401/403/404/422). Its error messages never contain the token.

One-time setup, after the PR with the trigger is merged:

1. **Make the token.** GitHub, your avatar, **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Name: `lucys-bookshop-backup-trigger`.
   - Expiration: **No expiration** if GitHub offers it. A token that expires silently stops the backups. If it does not, choose the longest and put the date in your calendar.
   - Repository access: **Only select repositories**, then `lucys-bookshop`.
   - **Repository permissions**: **Actions: Read and write**. Nothing else (Metadata: Read-only is added by itself).
   - Generate, and copy the token into your password manager right away. It is shown once.
2. **Give it to the Worker** (from `workers/hourly-job/`):

   ```bash
   pnpm dlx wrangler secret put GITHUB_TOKEN
   ```

   Paste the token when asked (nothing is shown).

3. **Deploy**, so the second cron trigger is created:

   ```bash
   pnpm dlx wrangler deploy
   ```

4. **Check** in the Cloudflare dashboard, the Worker, **Settings → Triggers → Cron Triggers**: both `17 * * * *` and `41 2 * * *` are listed. After the next 02:41 UTC, GitHub **Actions → Backup** shows a run started by `workflow_dispatch`, and the Worker's **Observability** shows `backup dispatched`.

`BACKUP_REPO` is a variable in `workers/hourly-job/wrangler.toml`, so it only reaches the Worker through `wrangler deploy`. A Worker made by pasting `index.js` into the dashboard needs `BACKUP_REPO` (`owner/name`) added by hand under **Settings → Variables and Secrets**.

If the token ever leaks, delete it in GitHub (that stops it at once) and make a new one. It can only start workflows of this one repository; it cannot read the repository's secrets or the bucket.

## Run it by hand

GitHub, **Actions**, **Backup**, **Run workflow**. Do it after changing any of the settings above, and look at the log: the last line names the stored object.

## Restore

Practise this once before you need it (the rehearsal is part of M8). It needs Docker, the `age` tool (`brew install age`) and this repo.

1. Put the R2 settings in your local `.env` (never committed): `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
2. Make an **empty** database to restore into. Locally, with `pnpm db:up` running:

   ```bash
   docker compose exec db createdb -U bookshop restore_check
   ```

   (Use your own `POSTGRES_USER`.) For a real disaster, create a new empty Neon project or branch instead, and use its direct address.

3. Put the private key in a temporary file. Type the command on the prompt first, copy the `AGE-SECRET-KEY-1...` line from the password manager, then press Enter:

   ```bash
   pbpaste > /tmp/age-identity.txt
   ```

4. Restore the newest backup (add `--key daily/.../....dump.age` for an older one):

   ```bash
   pnpm backup:restore --identity /tmp/age-identity.txt --target postgres://bookshop:<password>@127.0.0.1:5432/restore_check
   ```

   For a remote target add `--allow-remote`. The script refuses a target that already has tables (a restore into a used database would stop halfway), and a target that is the same database as `DATABASE_URL`, `MIGRATION_DATABASE_URL` or `BACKUP_DATABASE_URL`. That second check only works when those are set in your `.env`. On a fresh machine after a disaster they are not, and the script says so: then the address is only as safe as you type it, so read it twice.

5. Clean up, always:

   ```bash
   rm /tmp/age-identity.txt
   ```

   ```bash
   pbcopy < /dev/null
   ```

6. Look at the data: `docker compose exec db psql -U bookshop restore_check -c 'select count(*) from books'`. Then `dropdb` it.

To point a real deployment at a restored database, change `DATABASE_URL` and `MIGRATION_DATABASE_URL` in Vercel and redeploy. Do that only deliberately.

## Practise it

The daily run proves a dump can be made and listed (`pg_restore --list`), not that every table can be read back. Only a real restore proves that. Do the steps above once after the first backup, and again every few months, into a throwaway database, and look at the data. A backup that was never restored is a hope, not a backup.

## Rotating the key

If the private key may have leaked, make a new pair, change `AGE_PUBLIC_KEY`, and run the backup by hand. Old backups stay readable only with the old key: keep it until they expire (35 days).
