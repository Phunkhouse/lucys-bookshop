# 0017. Checkout and payment

Date: 2026-10-18
Status: accepted
Milestone: M4

## Context

M3 left the parts: a cart, `reserveBooks`, and empty `orders` tables. M4 joins them into a purchase a stranger can make (spec 6.4 to 6.6) with no payment service and no buyer e-mail. The risky parts are the order transaction, the totals, the payment QR code and "paid" (spec 1, high-scrutiny list).

## Decision

- **One transaction places an order** (`placeOrder`): locks the books in id order, compares prices, reads shipping from the settings, takes the order number, inserts the order and its snapshot items, and reserves. All or nothing. The browser's seen prices (books and shipping) are only compared: a mismatch stops the checkout and the server's value is what is charged.
- **Order number** `year * 10000 + sequence` (20260001), from an atomic upsert on `order_counters`, year by the Europe/Prague clock. It is also the variable symbol.
- **Retries.** The form keeps one `checkoutKey` per attempt. The same key with the same choices returns the same order; with other choices it is refused (`already_placed`) and the buyer is pointed to the order that exists. Concurrent submits queue on an advisory lock.
- **Payment.** SPAYD from integer minor units, Czech IBANs only. `PaymentConfirmer` has one implementation, the seller's manual confirmation: idempotent, and a late payment whose books went to someone else changes nothing (a conflict for the seller to settle). The seller's account is the `SELLER_IBAN` environment variable, not a database setting.
- **Order page** `/order/<token>` (256-bit token) shows no e-mail, name, phone or note. Expiry is computed on read. The QR code is drawn on the server as SVG shapes with `uqr`.
- **Rate limit** 10 checkout attempts per 10 minutes per address, counted in Postgres under a keyed hash of the address (`request_limits`). Zásilkovna is offered only once the seller has set its price.

## Alternatives considered

- In-memory rate limit: serverless instances share no memory, so it limits nothing on Vercel.
- Shipping price and IBAN in one settings place: the IBAN stays out of the database and the repo, set per environment.
- `qrcode` instead of `uqr`: heavier, and builds markup. `uqr` is 0.x, so `jsqr` (dev only) decodes the rendered code in a test.
- Editing the counter migration to cover existing orders: a second migration is safe whether or not the first was applied.

## Consequences

- **Before launch:** set `SELLER_IBAN` in Vercel (Production and Preview). Without it bank orders show no payment details.
- **Owed:** the admin page for the Zásilkovna price and pickup text. Until it exists the `settings` row is set by SQL. The seller cannot yet cancel an order (M5), so a visitor can hold books for 48 hours; the rate limit is the only brake.
- The address for the rate limit comes from `x-real-ip` or `x-forwarded-for`, which only a host like Vercel sets reliably (`src/server/client-address.ts`). Check it when the host changes.
- At most 9999 orders a year; the 10000th fails loudly.
- The three M4 migrations (two in #50, one in #53) went to Neon by hand. Deploy-time migration stays an M7 item.
- No account number is in the repo: tests build their IBAN at run time (`src/server/test-iban.ts`), and the e2e server gets one from `playwright.config.ts`.
- `pnpm test:e2e` resets the e2e buyer's orders, the rate limit and the shop settings of the local database, and refuses any other.
