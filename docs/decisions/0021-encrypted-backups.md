# 0021. Encrypted daily backups

Date: 2026-10-19
Status: accepted
Milestone: M5

## Context

Neon's free plan keeps only 6 hours of history, so a bad deploy or a deleted row noticed the next morning is unrecoverable. The repository is public and the database holds buyers' names, addresses and phone numbers, so a dump must never be a plain workflow artifact. The budget is zero, and there is one developer.

## Decision

A daily `pg_dump` runs in a GitHub Actions workflow, is encrypted with `age` against a public key, and is uploaded to a private Cloudflare R2 bucket. The private key stays with the developer (password manager plus a second independent copy) and is never in GitHub or Cloudflare, so a leaked CI secret cannot expose past dumps. The dump uses a read-only Neon role (`pg_read_all_data`). The workflow is started by the existing Cloudflare Worker, not by GitHub's scheduler. The bucket has a 30-day lock rule and a 35-day lifecycle expiry on `daily/`.

## Alternatives considered

- A GitHub `schedule` trigger: switched off after 60 days without repository activity, and it can start late.
- The Vercel or Neon built-in history: 6 hours on the free plan.
- A write-only R2 token: R2 has no such permission level. The closest is Object Read & Write scoped to one bucket, plus the lock rule so a leaked token cannot delete or overwrite recent backups.
- Encrypting with a password (`openssl`): then the secret has to sit in CI and can decrypt everything. `age` splits the key into a public half for CI and a private half for the developer.
- Workflow artifacts: public repository, personal data.

## Consequences

- If the private key is lost, every backup is unreadable. Hence the second copy, and a restore rehearsal at M8.
- GitHub secrets hold a read-only database login and an R2 token that can read the bucket, but not decrypt it.
- The restore script refuses to write into a database that is configured for the shop.
- The integration tests need Docker and the `age` command line tool (CI installs it).
- To revisit: a longer retention, off-site copies in a second provider, and a database dump per month kept longer.
