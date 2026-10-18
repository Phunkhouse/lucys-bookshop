# 0015. End-to-end test of the admin flow

Date: 2026-10-18
Status: accepted
Milestone: M2

## Context

M2 ends with one check that the whole chain works in a real browser: log in, add a book with a photo, see it in the shop. The unit and integration tests cover the pieces; this test covers how they fit together (login cookie, browser-side resize, upload to storage, saving, the shop page showing the photo).

## Decision

- One Playwright flow in `e2e/admin.spec.ts`: sign in, add a book with a photo, find it in the admin list, find it in the shop with a photo that really loads, then hide and delete it through the admin. That last part cleans up and also covers hiding and deleting.
- The test admin is made by `e2e/global-setup.ts` through `scripts/create-e2e-admin.ts`: a fixed test email, a new random password every run, passed to the tests through the environment. No password is stored in the repo. The script refuses any database that is not local, like the seed.
- The photo is drawn in the test (a generated PNG), so no image file is committed. The page resizes it into the JPEG renditions like any other photo.
- The book title is unique per run, so a leftover from an aborted run cannot be mistaken for it.
- The e2e CI job starts the same local S3-compatible server (SeaweedFS) as the `check` job.

## Alternatives considered

- A fixed test password in the seed: simpler, but a known login in a public repo, and one wrong environment away from being a real account.
- A committed JPEG fixture: works, but adds a binary file for no gain.
- More flows (wrong password, status changes) in the same PR: more coverage, longer and more brittle. Those paths already have unit and integration tests.

## Consequences

- The e2e run now needs the local storage server, locally too (`pnpm db:up`).
- A failed run can leave its test book behind in the local database; the next run does not depend on it.
