# 0018. Orders and notifications

Date: 2026-10-19
Status: accepted
Milestone: M5

## Context

M4 left a buyer able to place an order, but the seller could not run it (no cancel, no refund, no shipping) and nobody told her it existed. M5 makes the shop work end to end for one seller on free tiers (spec 6.4, 6.7, 6.8, 6.9, 8). The risky parts are the order status changes (they move books between reserved, sold and available), the double-send and lost-send cases of notifications, and a scheduler that can stop without anyone noticing.

## Decision

**Order actions** (`src/server/admin/order-status.ts`, rules in `order-transitions.ts`). Every action locks the order row first, then its books in id order, and changes only books the order still holds; calling one twice is safe. Statuses move through one table: `pending_payment` to `paid` or `cancelled`; `paid` to `shipped` (Zásilkovna only, tracking number required) or `completed` (personal pickup only) or `refunded`; `shipped` to `completed` or `refunded`; `completed` to `refunded`. Cancelled and refunded are final. A refund puts the books back on sale by itself. Completing is manual. A cash reservation is extended by the seller, by 48 hours. "Is this book still ours or free?" is one function (`conflictingBooks`) shared by mark paid, extend and the admin page, so the warning shows exactly what mark paid would refuse. The buttons on the page come from the same table (`availableActions`). Mark paid, cancel and refund ask first in a dialog.

**Seller notifications** (`SellerNotifier`, spec 6.8). New-order mail is sent after the buyer already has the answer, by email through Resend (plain `fetch`, verified domain), or only logged when no key is set. Delivery is at least once: `orders.seller_notified_at` is written after the send, a retry finds the unmarked ones. The reminder (reservation ends within 24 hours, once per order, `seller_reminded_at`) is at most once: orders are claimed in one atomic statement before the mail is sent. The mails are plain text with no buyer contact details; those stay behind the admin login.

**Scheduler.** `POST /api/jobs/hourly`, protected by a `JOBS_SECRET` bearer token, does the retry and the reminders; a Cloudflare Worker cron trigger calls it at minute 17 (`docs/hourly-job.md`). The job records its last run (`settings.jobs_last_run_at`), and the admin shows a warning when none is recorded for 3 hours or ever.

**Migrations** run in the production build: ADR 0019.

## Alternatives considered

- Notify inside the checkout transaction: a mail outage would fail checkouts.
- At most once for new-order mail: a crash at the wrong moment would lose an order notice. A duplicate is the lesser evil.
- GitHub Actions cron: runs only on the default branch, can start late, and is disabled after 60 days without repository activity. Vercel Cron: once a day on Hobby, which does not fit a 24 hour window.
- Resend scheduled mail for the reminder: needs cancelling on every status change and ties the shop to one provider.
- A free status dropdown in the admin: allows states such as "shipped" with books still reserved.

## Consequences

Known limits, accepted for one seller:

- The orders list has no pagination or search; orders are few.
- A retry batch can get stuck on orders that always fail (20 per run, no attempt counter), and a new-order mail can double-send if checkout and the retry race.
- A reminder is lost if the process dies between claim and send, and can repeat if a send times out after the provider accepted it.
- Order actions record no who or when beyond the status itself (the actor is passed but not stored).
- Previews share the production database.
- The local browser tests are flaky under heavy machine load (the dev server compiles routes on first request); CI serves a production build and is not affected.

Not done: the backup workflow (spec 11, M5), waiting for a decision on where encrypted dumps go (the repository is public, so a plain artifact is not an option). The seller's mailbox put the first test mail in Junk, so she has to mark the sender as not junk before launch; a Telegram channel behind the same interface comes after launch.
