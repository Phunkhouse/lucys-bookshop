# 0011. Catalog read path: derived availability, stable URLs

Date: 2026-10-08
Status: accepted
Milestone: M1

## Context

Every listing is one physical copy, so the shop must never offer a book that is taken, and shared links must never break. Reservations expire without a job (lazy expiry, spec 6.4), so what a visitor sees depends on the current time. The catalog and the detail page must agree with each other, and later with the reservation logic in M3.

## Decision

- **Status is stored, availability is derived.** `status` holds `available | reserved | sold | hidden`. A reserved book past `reservedUntil` counts as available, and sold books are listed for 14 days. The rule lives in two forms that must agree: TypeScript (`src/server/availability.ts`) and SQL (`src/server/availability-sql.ts`). Both take `now` as a parameter, so tests control the clock. A test puts books on every boundary into real Postgres (1 ms either side of the deadline and of 14 days) and checks that both give the same answer.
- **Fail safe on impossible data.** A reserved book without a deadline stays reserved, and a sold book without a date is not listed. The database check constraints already forbid both, so this only guards against a future mistake.
- **Plain data out of the service.** `listCatalog` and `getBookByShortId` return objects with the display status, genre keys and images, and no internal ids or `reservedUntil`. Genres and images are fetched in separate queries, so a book with several genres and photos is never duplicated by a join.
- **The short id is the key, the slug is decoration.** `/books/<shortId>/<slug>`: an outdated slug redirects permanently (308) to the canonical URL, so editing a title never breaks a shared link. A hidden, unknown or malformed id gives 404. A book sold long ago still opens, with a sold notice, but is not listed.
- **Pages render on every request** (`connection()`), because the result depends on time. The build never queries the database.
- **Ordering:** available books first (expired reservations included), then reserved and sold mixed, each group newest first, ties broken by short id.

## Alternatives considered

- Three ordering groups (available, reserved, sold): not needed. The spec only asks for available first, so the simpler two-group rule was chosen.
- Pagination now: deferred to M6 with filters and search. At 50-300 listings it costs nothing, and M6 reworks the query anyway.
- Automatic deletion of hidden books: rejected, see spec 6.9 (manual guarded delete in M2).

## Consequences

- Change the availability rule in both places, and the parity test fails if they disagree. M3 reuses `isAvailableSql` for the reservation `UPDATE`.
- Every request to the catalog hits the database. Neon scales to zero, so the first request after a quiet period is slow. Caching is a later option.
- A schema change needs its migration applied to Neon before the deploy. Nothing does this yet, so until the M7 deploy step it is a manual `pnpm db:migrate`. The first catalog deploy failed on Vercel because Neon had no tables.
- The catalog and detail page ignore photos. Every book shows a text placeholder until the upload pipeline and image loader (M2).
- `/books/<id>` without a slug returns 404. Add a redirect route if shared links turn out to drop it.
