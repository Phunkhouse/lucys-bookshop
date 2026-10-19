# Backups

How the production database is copied every day, where the copies are, and how to restore one (ADR 0021). Everything here uses invented example values. Never put a real key, token or database address in the repo, in an issue, in a PR or in a chat.

## What happens

Once a day a Cloudflare Worker asks GitHub to run the workflow `.github/workflows/backup.yml`. The workflow:

1. dumps the production database with `pg_dump`, through a **read-only** database role,
2. encrypts the dump with `age` and the **public** key, so the job cannot read it back,
3. uploads it to a private R2 bucket as `daily/YYYY-MM-DD/lucys-bookshop-<UTC time>.dump.age`, and checks that the stored size matches.

The repository is public, so the dump is never an artifact and never leaves the runner unencrypted. Only the private key can read a backup. It is in two places owned by the developer (a password manager, and a second copy somewhere independent) and **nowhere else**: not in GitHub, not in Cloudflare, not in the repo.

The bucket `lucys-bookshop-backups` (EU jurisdiction) has a lock rule that stops deleting anything under `daily/` for 30 days and a lifecycle rule that removes objects after 35 days. So about 30 daily copies exist at any time. R2's free tier (10 GB-month) is far more than a small shop's dump needs.

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

   For a remote target add `--allow-remote`. The script refuses a target that is the same database as `DATABASE_URL`, `MIGRATION_DATABASE_URL` or `BACKUP_DATABASE_URL`, so it cannot overwrite the live shop by accident.

5. Clean up, always:

   ```bash
   rm /tmp/age-identity.txt
   ```

   ```bash
   pbcopy < /dev/null
   ```

6. Look at the data: `docker compose exec db psql -U bookshop restore_check -c 'select count(*) from books'`. Then `dropdb` it.

To point a real deployment at a restored database, change `DATABASE_URL` and `MIGRATION_DATABASE_URL` in Vercel and redeploy. Do that only deliberately.

## Rotating the key

If the private key may have leaked, make a new pair, change `AGE_PUBLIC_KEY`, and run the backup by hand. Old backups stay readable only with the old key: keep it until they expire (35 days).
