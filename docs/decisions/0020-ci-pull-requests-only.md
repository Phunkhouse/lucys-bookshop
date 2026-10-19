# 0020. CI: pull requests only, and no duplicate work

Date: 2026-10-19
Status: accepted
Milestone: M5

## Context

The repository is public, so CI minutes cost nothing today, but the setup should be reusable in a private repository with limited free minutes. CI had two jobs, `check` (format, lint, typecheck, unit and database tests, production build) and `e2e` (Playwright), on every pull request push and again on every push to `main`.

Measured from the last 40 successful runs and the last 100 runs overall:

- **242 runner-seconds per run** (4.0 min): `check` 135 s, `e2e` 106 s. The two run in parallel, so a run takes about 2.3 min on the clock.
- Biggest steps: `test:db` 29 s, `build` 23 s, `test` 20 s, Postgres container 15 to 16 s, photo storage 11 to 13 s, Playwright install 20 s, the e2e step itself 42 s (it builds the app first).
- **37% of runs were post-merge `push` runs**, as costly as a pull request run. Only 2 of 100 runs failed. In 26 consecutive pushes to a pull request none overlapped with a running one. 11% of commits on `main` touched only docs.
- Both required checks (`check`, `e2e`) are enforced by rulesets on `main` with "branch must be up to date" and no bypass.

## Decision

1. **CI runs on pull requests, not after the merge.** The rulesets mean code reaches `main` only after `check` and `e2e` passed on a tree that already contained `main`, so a post-merge run would repeat it. A **weekly scheduled run** (Monday) catches drift: a floating image tag such as `postgres:18`, Node 24 updates.
2. **`concurrency`** cancels an outdated run when the same pull request is pushed again. Scheduled runs are never cancelled.
3. **One production build per run.** `pnpm build` is removed from `check`: the e2e job already builds (`pnpm build && pnpm start` in its Playwright config), and Vercel builds every pull request too.
4. **Postgres health check every second** (30 tries) instead of every 5 s. Measured locally on a throwaway container: healthy after 1.3 s instead of 5.2 s, about 4 s per job.
5. **SeaweedFS ready when `/status` answers 2xx**, polled twice a second, instead of "any reply". Measured: both pass after about 3.4 s, so no time is gained; the new check is stricter (a half-started server answers with errors too), and a bucket could be created the moment it passed.

The job names `check` and `e2e` are unchanged, so the rulesets need no edit.

## Alternatives considered

- **Splitting light and heavy checks, or skipping heavy ones on docs-only changes.** The jobs already run in parallel and failures are rare (2%), so fail-fast saves almost nothing. A workflow-level path filter leaves required checks pending forever; it would need an always-running "changes" job, for about 11% of runs.
- **Merging `check` and `e2e` into one job.** Saves about 40 s per run (one checkout, install, container start), costs about 80 s of wall-clock time, and the required check names in the rulesets would change. A later option if minutes get scarce.
- **Caching the Playwright browser.** The system packages still have to be installed, so it saves 8 to 10 s at most (under 4%). **Caching `.next/cache`** saves a few seconds. Not worth another cache to maintain; measure first.
- **Caching Docker images:** saving and restoring them is slower than pulling them.

## Consequences

- About **45% fewer runner minutes**: a pull request run drops from 242 s to about 211 s (build 23 s, Postgres 8 s), and the post-merge runs are gone. Per 100 runs: 403 min before, about 222 min after, plus 4 min a week for the scheduled run. Coverage is unchanged and the wall-clock time of a check is the same or slightly shorter.
- We lose a post-merge confirmation. What remains: the rulesets, Vercel's production build (with the migration step, ADR 0019) on every merge, and the weekly run.
- If the e2e job ever becomes conditional, add the build back to `check`.
- A GitHub scheduled workflow stops after 60 days without repository activity (see `docs/hourly-job.md`); the weekly run is only a drift detector, so that is acceptable.

## Reusing this in another repository

1. Rulesets on the default branch requiring the CI job names, "branch must be up to date", no bypass.
2. CI on `pull_request` plus a weekly `schedule`; no `push` run; `concurrency` that cancels only pull request runs.
3. One production build per run, in the job that starts the app.
4. Health checks every second, and readiness on a real endpoint. Never use a workflow-level `paths` filter together with required checks.
5. If minutes are scarce: merge the jobs as above.

To measure again, for any workflow: `gh api "repos/OWNER/REPO/actions/workflows/ci.yml/runs?per_page=40&status=success"`, then `gh api repos/OWNER/REPO/actions/runs/RUN_ID/jobs` for the start and end of every job and step.
