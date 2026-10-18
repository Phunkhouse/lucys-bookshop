# 0016. Cart and reservation

Date: 2026-10-18
Status: accepted
Milestone: M3

## Context

Every listing is one physical copy, so two buyers can reach for the same book at the same moment (spec 2). M3 builds the cart and the reservation logic that prevents double-selling (spec 6.3, 6.4). Checkout, which creates the order and reserves in one transaction, is M4, so M3 delivers parts that M4 plugs together.

## Decision

- **Cart in the browser, prices from the server.** localStorage (`cart.v1`) holds only `{ shortId, priceMinorSeen }` per book, at most 50. The seen price is only compared. `validateCart` (read-only) reads the current state from the database and returns each line as ok, price changed (the buyer confirms), unavailable (reserved or sold, title kept) or gone (hidden or unknown, nothing revealed). The subtotal is the sum of server prices. Books that are taken leave the cart with a notice saying which and why.
- **Cart is a page** (`/cart`), not a drawer, so no dialog accessibility work is needed. It shows the subtotal only, labelled "bez dopravy": shipping is chosen at checkout (M4), so a total cannot exist yet. This narrows spec 6.3 for now. A header (`SiteHeader`) was added because the cart needs a way in.
- **`reserveBooks(tx, ...)`** runs inside the caller's transaction. It locks the book rows in id order (`FOR UPDATE`), checks every book, throws before writing if any is taken, then does the conditional `UPDATE ... WHERE <available>` of spec 6.4 with the same SQL rule as the catalog. Reservation is 48 hours. An expired reservation is simply overwritten (lazy expiry, no job).
- **Full `orders` and `order_items` tables now** (spec 7 shape, plus an `orders.currency` column), with `books.reservedByOrderId` nullable and a restricting foreign key from `order_items` to books. A book that was ever ordered cannot be deleted; `deleteBook` reports `has_orders`.

## Alternatives considered

- A cart drawer: the spec allowed it. Not chosen: more accessibility work for no gain at this stage.
- Showing shipping and a total in the cart: spec 6.3 says so, but shipping options belong to M4.
- Only the minimum orders columns now: less to review, but M4 would then reshape the table. Full shape chosen.
- A single `UPDATE ... RETURNING` with no locking first: correct for one book. For a cart it can leave part of the cart updated if a caller catches the error, and two carts sharing books in opposite order can deadlock. Locking in id order and checking before writing avoids both.

## Consequences

- Reservation is tested against real Postgres (`src/server/reservations.int.test.ts`): two buyers (25 rounds), four buyers (10 rounds), overlapping carts in opposite order (25 rounds), all-or-nothing, expiry edges, rollback with the caller. The pool has 5 connections, so those tests use at most 4 at once.
- Nothing in the UI reserves a book until checkout (M4). Between "in the cart" and checkout the book can be taken; checkout tells the buyer which one.
- The cart page checks again after every change, one server call each (server actions run one at a time). Revisit only if it feels slow on a phone.
- The cart check has no rate limit (read-only). Checkout and login need one (spec 8).
- Prices are formatted in three places (`BookCard`, `BookDetailView`, `AdminBookRow`) plus the new `useMoney`; merge them when one of them is touched next.
