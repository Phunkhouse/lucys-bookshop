# Used Books E-shop: Spec v15

Status: decisions from the first to fourth iteration rounds (2026-10-02 to 2026-10-04), the M1 and M2 planning rounds (2026-10-08), the domain purchase, the M3 planning round and the M4 build (2026-10-18), and the M5 build with the CI and Zásilkovna changes (2026-10-19), including the encrypted daily backup (2026-10-20), and the M6 build (2026-10-20), are merged in. Sections that changed from v12 are marked **(v13)**; v12 marks are kept as history, and so are the earlier ones. Remaining open items are in section 13.

## 1. Purpose **(v11)**

A minimalist online shop where one seller sells her finished books, one copy at a time. Closer to a marketplace listing than to a classic e-shop: a few sales a month, no stock, no scaling concerns.

- **Business goal:** let buyers browse, filter, and reserve books and pay by bank transfer (or in cash on pickup), without the seller exchanging manual messages for every sale.
- **Learning goal:** practice full-stack work (Next.js, Postgres, Node backend, CI/CD, deployment) with an agent-orchestrated workflow, and later add accounts and AI features.
- **Showcase:** the repository is public and serves as a portfolio piece (see 9 for the hygiene rules this implies).

### Working agreement **(v4)**

The developer writes almost no code. His role is the one described in many AI-engineer job openings: orchestrate the agent and be responsible for the output.

- **Developer writes:** project setup only (Next.js, repo, Docker, CI skeleton). Claude can help even there.
- **Claude writes:** all application code, tests, migrations, workflows, and the milestone notes.
- **Developer owns:** the spec, acceptance criteria, review of every change, and the final decision to merge.
- **Small pull requests.** One feature or one concern per PR on a branch, never direct pushes to main. CI (lint, typecheck, tests, build) is the first gate; the developer's review is the second.
- **Tests as the spec for risky logic.** For reservations, order totals, payment matching, and access control, the developer approves the test cases first, then Claude implements. This is the lowest-effort way to stay in control.
- **High-scrutiny review areas** (read line by line): the reservation transaction, order and total calculation, SPAYD generation, auth checks on admin routes, database migrations, image upload verification, and anything touching secrets or CI deploy tokens.
- **Low-scrutiny areas** (skim, rely on CI and a visual check): styling, copy, boilerplate.
- **A second pair of eyes:** after Claude writes a PR, a separate review pass (a fresh Claude session or subagent that has not seen the writing) checks it against the spec before the developer reads it.
- **Definition of done per milestone:** CI green, tests for the risky logic, checked on a real phone, and a short "why this design" note in `docs/decisions/`.
- **AGENTS.md** in the repo holds conventions (folder layout, the framework-free service layer rule, naming, testing rules, what never to commit) so every session starts from the same rules, whichever coding agent runs it. `CLAUDE.md` only imports it (decision note 0013).

## 2. Key insight: every item is unique

Each listing is one physical copy:

- No quantity selector. A book is either available or it isn't.
- Two buyers can try to get the same copy at the same time, so the system must prevent double-selling.
- Each listing needs its own photos and condition description.
- The seller creates listings constantly, so adding a book must take under a minute.

## 3. Assumptions and confirmed decisions

- Seller and most buyers are in the Czech Republic. Currency is CZK. Shipping only within the Czech Republic.
- **UI language: Czech only for v1, but the app is prepared for English** (see 10, internationalization).
- Books are used, in mixed languages. Roughly 50-300 listings at a time.
- No buyer accounts in v1. Guest checkout.
- **Two admin users with identical rights (v8):** the developer and the seller. There are no separate roles. The developer lists books at first, then hands the work to the seller and keeps access.
- **Payment: QR bank transfer to the seller's Raiffeisenbank account, confirmed manually by the seller in admin; or cash on personal pickup.**
- **Reservation window: 48 hours, expired reservations are released silently.**
- **Domain (v13):** `lucys-bookshop.cz` is bought. Until it is connected (M7), development and previews use the free `<name>.vercel.app` address.
- **No emails to buyers in v1** (they need a verified sending domain, which the new domain makes possible later). The seller contacts buyers herself. The seller is notified about new orders (see 6.8).
- Budget: free tiers only.
- AI features are explicitly after v1; the architecture reserves nothing for them yet.

## 4. Scope

### In scope for v1

- Single-page catalog with filters, sorting, and search
- Book detail view (own URL, shareable)
- Cart and guest checkout
- Payment by QR code bank transfer with manual confirmation, or cash on personal pickup
- Shipping options: personal pickup and Zásilkovna (manual)
- Seller notifications
- Admin area (phone and desktop) to add/edit/mark books and manage orders
- Legal pages, basic SEO, deployment

### Out of scope for v1 (planned later)

- Emails to buyers (confirmation, payment received, shipped); they need a verified sending domain on `lucys-bookshop.cz`
- Automatic payment matching: CSV statement import first, Raiffeisenbank Premium API only if a personal account can use it
- English UI content
- Buyer registration, login, order history
- Wishlists, reviews, newsletter
- Multiple sellers
- Automated shipping carrier integration (Zásilkovna API and pickup-point widget)
- Card payments (Stripe is to be learned in a separate project)
- AI features (see section 12)

## 5. Users and core stories

**Visitor**

- I can see all available books, plus recently sold ones, and filter and sort them quickly on mobile.
- I can open a book, see photos, condition, and price, and share its link.
- I can add books to a cart, enter shipping details, and get payment instructions with a QR code on a page I can come back to.

**Seller (admin)**

- I can add a book with photos in under a minute, from my phone or from a computer, and add photos or fix details afterwards.
- I am notified when somebody places an order or reserves a book with pay-on-pickup.
- I see orders and can tell which are unpaid, which are paid, what to pack, and where to send it.
- I can mark an order as paid after seeing the money arrive in my bank (or after cash on pickup).
- I get a reminder when an unpaid reservation is about to expire, so I can write to the buyer myself.
- I can mark an order as shipped (with an optional tracking number) and contact the buyer with a prefilled message.
- I can hide or delete a listing, and fix a mistake in price or description.

## 6. Functional requirements

### 6.1 Catalog (the "one pager") **(v7)**

- Grid or list of book cards: cover photo (or placeholder), title, author, price, condition, genre tags, status badge.
- **Filters:** genre (multi-select), price range, condition, language, availability. Optionally publication year and format.
- **Sorts:** newest first (default), price low-high, price high-low, title A-Z, author A-Z.
- **Search:** text search across title and author (and ISBN).
- Filter and sort state lives in the URL query string, so views are shareable and the back button works.
- Show result count and a clear "reset filters" action. Show a friendly empty state.
- Server-side filtering and sorting, with numbered pages of 24 books (`?page=2`, no "load more"). Several selected genres match any of them, text search ignores accents, and available books come first in every sort (decision note 0022). Publication year and format are left for later: the schema has neither. The URL is the only state: a form without JavaScript, redirected to the short form of the view.
- **Visible statuses:** available books, reserved books (badge "Rezervováno"), and books sold within the last **14 days** (badge "Prodáno"), so the shop looks active. Sold and reserved books cannot be added to the cart. Available books sort first.
- This is computed in the query (`status = 'sold' AND soldAt > now() - 14 days`), with no job. Older sold books disappear from the catalog and the sitemap, but their detail page still works with a sold notice, so shared links never break.
- A book counts as available if it is `available`, or `reserved` with an expired reservation (see 6.4).

### 6.2 Book detail **(v7)**

- Photo gallery, title, author, description, genre, language, condition (with its note), ISBN, price.
- Add-to-cart button (disabled with a clear message if reserved or sold).
- **URL shape: `/books/<id>/<slug>`.** The `<id>` is a random short id (6-8 lowercase base36 characters) and is the only part used for lookup. The `<slug>` is computed from the current title (Czech characters transliterated, capped at about 60 characters) and is cosmetic. If the slug in the URL does not match the current title, the page redirects permanently to the canonical URL, so editing a title never breaks shared links.
- A `hidden` book has no public page: its URL returns 404.
- Rendered as a page for SEO and sharing.

### 6.3 Cart **(v13)**

- Each book can be in the cart once.
- Cart stored client-side (localStorage), always **re-validated on the server** at checkout: items still available, prices current.
- **A cart page (`/cart`)**, not a drawer, showing items and the subtotal. Shipping and the total appear at checkout, where the shipping option is chosen (M3 decision, ADR 0016).
- If a book became unavailable while in the cart, tell the user and remove it. If a price changed, show the new price and ask the buyer to confirm.

### 6.4 Reservation (prevents double-selling)

- When a buyer submits checkout, the order is created and the books in it are **reserved for 48 hours** (`reservedUntil = now + 48h`).
- **Expiry is lazy.** There is no job that frees books. Any query treats a book as available when `status = 'available'` OR (`status = 'reserved'` AND `reservedUntil < now()`).
- Reserving is a single atomic conditional `UPDATE ... WHERE <available condition> RETURNING id` inside a transaction with the order insert. If any book in the cart fails to reserve, the whole checkout is rolled back and the buyer is told which book is gone. This is the double-selling protection and the main target for race-condition tests.
- An order whose reservation has expired is shown as expired (cancelled) the next time it is read. The buyer is not notified.
- When the seller marks an order as paid, the books become `sold` and `soldAt` is set.
- **Cash on pickup (v5):** same 48h window by default, and only the seller can **extend** the reservation from admin (buyers cannot). She marks the order paid at handover. In v1 any buyer may choose cash on pickup; if no-shows become a problem, add an approval step.
- **Late payment policy:** if the seller sees a payment for an expired order, marking it paid re-checks the books. If they are still free, they are re-reserved and sold. If someone else got them, the admin shows the conflict and the seller refunds manually from her bank and cancels the order.
- **Seller reminder:** about 24 hours after checkout, if the order is still unpaid, the seller is notified (and the admin list flags it) that the reservation will be released in about 24 hours, so she can contact the buyer herself. The buyer gets no automatic reminder in v1. This needs a scheduled job (see 10).

### 6.5 Checkout **(v13)**

- Guest checkout: name, email (so the seller can write to the buyer), phone, shipping details.
- **Shipping options (v1):**
  - _Personal pickup_ (free), payable by bank transfer or **in cash on pickup**.
  - _Zásilkovna_ (Czech Republic only), handled manually: the buyer enters the pickup point as text, the price is a **fixed flat rate editable in admin**, and the seller creates the parcel in the Zásilkovna app and pastes the tracking number into admin. Pickup-point widget and API automation come later.
- Order summary before submitting.
- Required checkboxes: agreement with terms, acknowledgement of privacy policy.
- On submit: server validates cart, calculates totals, creates the order, reserves the books, and shows the **order page** at an unguessable link (`/order/<token>`) with QR code, account number, amount, variable symbol, and deadline. For cash on pickup the page shows the pickup instructions instead of the QR code. The buyer is told to bookmark or screenshot the page, since there is no confirmation email.
- No redirect to an external provider and no card data anywhere.
- **Built in M4 (ADR 0017).** The checkout page is `/checkout`, linked from the cart once every line is clean. Zásilkovna is offered only after the seller has set its price. The browser sends the prices it showed (books and shipping); the server compares them with its own, stops on a mismatch and charges its own values. One checkout key per attempt makes a double press return the same order; a retry with different choices is refused and points to the order that exists. The time the buyer accepted the terms is stored. Checkout is limited to 10 attempts per 10 minutes per address, counted in Postgres.
- The order page shows no e-mail, name, phone or seller note: the link is the only secret.

### 6.6 Payments **(v13)**

- **QR platba** in the Czech SPAYD format, generated server-side from the order (account IBAN, amount, variable symbol, message). No external payment service.
- **The seller's account** is the `SELLER_IBAN` environment variable (a Czech IBAN), not a database setting, and is never committed. Until it is set, a bank order's page says the payment details are missing. The QR message is `Objednavka <number>`.
- **Variable symbol = the numeric order number** (digits only, at most 10), so payments can be matched to orders.
- Source of truth for "paid" is the **seller's manual confirmation** in admin, after she sees the money in her Raiffeisenbank account (or receives cash).
- Payment confirmation goes through a `PaymentConfirmer` interface in the service layer. v1 has one implementation (manual). Later implementations (CSV statement import, Raiffeisenbank Premium API) plug in behind the same interface without changing order logic.
- Marking paid must be **idempotent** (safe to click twice, safe if a future importer reports the same transaction twice).
- Underpayment, overpayment, or a wrong variable symbol: the seller resolves these by hand; the admin order has a free-text note field.
- Never trust prices or totals sent from the browser; calculate on the server.
- Refunds are done manually from the bank; the admin records the order as refunded.

### 6.7 Orders

Statuses: `pending_payment` → `paid` → `shipped` → `completed`, plus `cancelled` (includes expired) and `refunded`.

- Numeric human-readable order number, for example 20260001 (year plus sequence), also used as the variable symbol.
- `paymentMethod`: `bank_transfer` or `cash_on_pickup`.
- Each order stores a **snapshot** of item titles and prices at purchase time, plus the shipping details and chosen method.
- Seller can add a tracking number and mark as shipped.
- Admin offers a **"write to buyer" button** that opens a prefilled message (mailto), covering payment received, shipped, and reservation reminders without any email infrastructure.

### 6.8 Notifications (replaces transactional emails in v1) **(v14)**

- **To the seller:** new order or reservation (including cash on pickup), and the reservation-expiring reminder (about 24h after checkout, unpaid orders only, once per order).
- Payment itself is seen in her bank app. The app cannot know about it until she marks it paid.
- **Delivered by email to the seller's own address (v14)** through a `SellerNotifier` interface, sent with Resend from `objednavky@lucys-bookshop.cz` on the verified domain, so there is no sandbox sender and any recipient works. A new-order mail goes out right after checkout and is sent at least once (`orders.seller_notified_at`, retried by the hourly job); the reminder is sent at most once. Messages are plain text and carry no buyer contact details, only a link to the admin. Without a key (development, CI) they are only logged. The first test mail to the seller's own mailbox (Hotmail) landed in Junk, so she marks the sender as not junk before launch (M7). A Telegram bot as a second channel behind the same interface comes after launch. Decision note 0018.
- **Buyers receive no emails in v1.** An `EmailSender` interface is added later, together with a verified sending domain on `lucys-bookshop.cz`.

### 6.9 Admin area **(v10)**

**Essential. Without it the seller can't run the shop.** Built as part of the app, not as a CMS, because the admin is the business logic (reservations, orders, payments).

- Login with **Better Auth**. There is a single admin level: every signed-in user has full admin rights, and there are two accounts (the developer and the seller). Public sign-up is disabled; accounts are created only by a script (`scripts/`) run against the target database, so being signed in is the same as being allowed. No invite flow, user-management screen or email is needed. Every server action and service entry point checks the session itself; the proxy redirect is only a convenience. Auth.js is in maintenance mode and not used.
- Add/edit book form: title, author, genres, language, condition, condition note, description, price, ISBN, **photos (up to 5, reorderable, can be added, replaced or removed at any time)**.
- A listing can be saved **without photos**. It shows a "photos coming soon" placeholder to buyers and a "no photos" flag in admin.
- **Phone-first listing flow:** camera input for photos, resize in the browser, upload straight to object storage with a presigned URL, minimal required fields.
- Nice to have: ISBN lookup to prefill title/author/cover (Open Library or Google Books API).
- Responsive for both phone and desktop.
- Book list with status (available, reserved, sold, hidden), quick toggle to hide, and a status filter (including a "Hidden" view). Each book shows when it was last changed (from `updatedAt`, so any edit counts, not only a status change). The toggle appears only on available books (to hide) and hidden books (to show again). A reserved book leaves that state by expiry or by cancelling its order, and a sold book stays sold, so neither can be hidden; if a buyer reserves a book while the seller's page is stale, the toggle is refused with a message.
- **Deleting a book is manual and guarded:** there is no automatic cleanup of hidden books. **Only a hidden book can be deleted**: a hidden book is already out of the shop, so nothing breaks, while a live listing has to be hidden first and a sold book stays. Delete asks for confirmation (a dialog, shown as a sheet at the bottom of the screen on phones), is refused if any order references the book, and also removes the book's photos from object storage. Books that were ever ordered stay as `hidden` or `sold`; sold books are never cleaned up, because their detail page must keep working for shared links. If hidden books pile up, a "stale hidden" flag in the list (for example hidden for more than 90 days) can be added later; it flags only and never deletes.
- Orders list and detail: status changes, "mark paid", extend reservation, expiring-soon flag, notes, "write to buyer".
- Settings: Zásilkovna flat price, pickup instructions.

### 6.10 Static and legal pages

- About/contact page, shipping and payment info, terms and conditions, privacy policy, cookie notice (if analytics or marketing cookies are used).
- Wording depends on the seller's legal status (section 9).

## 7. Data model (draft) **(v8, v13)**

- **Book**: id, **shortId** (random, unique, immutable; used in the URL; the slug is computed from the title and not stored), title, author, isbn (indexed, not unique), description, language, condition (`like_new` | `used`), conditionNote, priceMinor (integer), currency, status (available | reserved | sold | hidden), reservedUntil, reservedByOrderId, createdAt, updatedAt, soldAt
- **Genre**: id, key, slug (labels live in the messages files under `Genres.<key>`)
- **BookGenre**: bookId, genreId (many-to-many)
- **BookImage**: id, bookId, **baseKey** (object storage key prefix; the three renditions live under it), position, width, height
- **Order**: id, number (also the variable symbol), publicToken, status, paymentMethod, email, name, phone, shipping details (including pickup-point text), shippingMethod, shippingCostMinor, totalMinor, currency, locale, expiresAt, sellerRemindedAt, trackingNumber, note, checkoutKey (unique), termsAcceptedAt, createdAt, paidAt
- **OrderItem**: id, orderId, bookId, titleSnapshot, priceMinorSnapshot
- **Users and sessions**: managed by Better Auth, no role field (one admin level)
- **Settings**: one row: Zásilkovna flat price (none means Zásilkovna is not offered), pickup instructions
- **OrderCounter**: year, last sequence number used (order number = year × 10000 + sequence)
- **RequestLimit**: key (a keyed hash of the address, never the address), window start, count

Notes: `reservedByOrderId` is added in M3, together with the orders table and its foreign key; M1 does not create it. `updatedAt` is set on every change to a book. Store money as integers, never floats. Add database indexes on status, reservedUntil, soldAt, genre join, and price. Use database transactions when reserving and marking sold. Full-text search via Postgres. The image base URL is an environment variable.

**Duplicate copies:** one `Book` row per physical copy (duplicated metadata is accepted in v1). If it becomes a nuisance, split into a shared `Title` (title, author, ISBN, description, cover) and per-copy `Book` rows by adding a nullable `titleId` and backfilling by ISBN. Reservation and orders already work on the copy, so they do not change.

## 8. Non-functional requirements

- **Performance:** fast on mobile; images pre-sized and lazy-loaded; pages cached where possible.
- **SEO:** server-rendered catalog and book pages, titles and meta descriptions, Open Graph images, sitemap, structured data (Book/Product).
- **Accessibility:** semantic HTML, keyboard navigation, contrast, alt text for covers.
- **Security:** validate all input (Zod), rate-limit checkout and login, secure admin routes, protect the scheduled-job endpoint with a secret, secrets in environment variables, HTTPS, unguessable order tokens.
- **Reliability (v15):** a daily encrypted `pg_dump` in a private R2 bucket (Neon's free history window is only 6 hours), with a warning in the admin when no backup was reported for 36 hours (decision note 0021); error tracking and basic logs.
- **Privacy/GDPR:** collect only what's needed for shipping and contact; define how long orders are kept; no unnecessary tracking.
- **Portability:** the app must not depend on Vercel-only services, all external settings are environment variables, and nothing about hosting is hard-coded, so moving to the seller's accounts and later to another host is a configuration change.

## 9. Legal, business, and accounts

This is not legal advice.

**Is the seller a trader?** Czech sources indicate that selling one's own unneeded used belongings is not business, and the income is exempt. The line is crossed by repeatedly buying items to resell them for profit; character and scope of the activity matter, not only income. Selling her own finished books a few times a month looks like the favorable case, but a permanent branded shop and any future buying for resale are risk factors. **Action:** one question to an accountant, the tax office, or the trade licensing office, before launch.

**Two scenarios, kept switchable:**

- _Private seller:_ simple terms, short privacy notice, seller contact.
- _Trader:_ seller identification, consumer terms and conditions, 14-day withdrawal right and return process, possibly tax registration. Build these as content and configuration that can be switched on, not as hard-wired code.

**Hosting terms:** Vercel Hobby is restricted to non-commercial personal use, defined as any deployment used for financial gain. A live shop collecting money is likely outside it regardless of legal status. This applies to the seller's account too. Before launch: ask Vercel support for a written answer, or move to another host (candidates: Cloudflare, Netlify with terms checked, self-hosted Docker on a free VM).

**Accounts and handover:**

- Development runs on the developer's accounts. After testing, production moves to **accounts owned by the seller**, so her shop does not use the developer's free-tier limits. The developer keeps access (shared credentials in a password manager with 2FA where a service has no second-user option, invited membership elsewhere).
- **Domain (v14):** `lucys-bookshop.cz` is bought and registered at Active24, with DNS on their Websupport nameservers. The registration stays with the developer, as domain maintainer, so the domain is not part of the handover (M8); Vercel and Resend are connected to it through DNS records. It is connected to the production Vercel project in M7 (DNS, HTTPS, redirect from `www`): add Vercel's records to the existing zone and keep the Websupport nameservers, so the Resend records stay. The `vercel.app` address is not shared with buyers.
- **One public repository** in the developer's GitHub. Until the handover, Vercel deploys every merge through its Git integration; at the handover (M8), deployment to the seller's Vercel project runs from **GitHub Actions** with a deploy token from her account. Her secrets live in repository secrets.
- Handover steps: Vercel (new project in her account via CI), Neon (restore a `pg_dump` into her project), Cloudflare R2 (copy objects and update the base URL env var), update secrets. The domain registration is not moved: it stays with the developer.
- **Public repo hygiene:** seed data is invented books, never her real listings; no secrets, bank account number, or personal data in the repo.

Also: privacy policy and cookie rules (GDPR); QR payments need only the seller's account number, no provider onboarding.

## 10. Tech stack and architecture **(v15)**

- **Frontend and app:** Next.js (App Router), TypeScript.
- **Visual direction (v5):** this is a working prototype first. Shop name is the working title "Lucy's Bookshop", kept in one config value and the messages file, never hard-coded in components, because it will change. Styling is very light and almost brutalist, but accessible: system font stack, high contrast (WCAG AA), visible focus states, large touch targets, no decorative shadows or gradients. All colors, spacing and type sizes are design tokens (CSS custom properties), so a later art direction is mostly a token swap. Art direction is decided after the shop works.
- **Styling (decided):** CSS Modules with SCSS. Design tokens (colors, spacing, type scale) are CSS custom properties so theming and dark mode stay possible; SCSS is used for nesting, mixins and breakpoints. No Tailwind.
- **Components (decided):** no component library for now. A small set of focused components of our own (`Button`, `Input`, `Badge`, `Card`, and so on). Accessibility-heavy pieces (cart drawer, mobile filter sheet, multi-select genre filter) use the native `<dialog>` element or an unstyled headless primitive library; decide at the milestone where each appears.
- **Forms and mutations (proposed):** server actions with a Zod schema shared between client and server for validation. React Hook Form with the Zod resolver is used only for the complex client forms (the admin book form with photo handling, and checkout).
- **Data fetching (proposed):** Server Components call the service layer directly; catalog filters are URL-driven. No TanStack Query unless a client-side polling or optimistic-update need shows up. The cart is a small client store (React context or a tiny store) backed by localStorage.
- **Architecture:** modular monolith. All business logic (catalog, reservations, orders, payments, notifications) lives in a plain TypeScript layer (`src/server/`) that imports nothing from Next. Route handlers and server actions are thin: parse input, call a service. Interfaces (`PaymentConfirmer`, `SellerNotifier`, later `EmailSender` and a shipping provider) keep integrations swappable.
- **Database:** PostgreSQL on **Neon** free plan (scales to zero after idle, so expect a slow first request after quiet periods). Docker Postgres locally.
- **ORM:** **Drizzle** (confirmed)
- **Validation:** Zod
- **Payments:** QR platba (SPAYD) with manual confirmation behind a `PaymentConfirmer` interface
- **Notifications:** `SellerNotifier` with an email implementation (see 6.8); no buyer email in v1
- **Images (decided):** Cloudflare R2 (probable), presigned uploads from the browser. Photos are resized **in the browser at upload** into three renditions (about 480px thumb, 960px medium, 1600px large, WebP or JPEG), handling EXIF orientation, and stored under `books/<bookId>/<imageId>/`. The database stores one base key. Photos are shown with a plain `<img>` whose `srcset` lists the three pre-made renditions, so the browser picks the nearest one; Next's image component is not used (decision note 0014). That needs no loader and no client code, uses no Vercel image optimization quota, and works on any host. Saved photos carry a one-year immutable `Cache-Control`, because a changed photo is always a new file at a new address. The server checks each uploaded object (type and size) before attaching it to a book. Not Vercel Blob.
- **Auth (admin only):** Better Auth, email and password, sign-up disabled, one admin level, accounts created by script
- **Internationalization:** a locale-routing library for the App Router (next-intl is the likely choice), Czech with no URL prefix and English later under `/en`. All UI text in `messages/cs.json`. Money and dates formatted with `Intl`. Book titles, authors, and descriptions are not translated; genres and condition labels are translated through keys. `locale` is stored on the order.
- **Testing (proposed):** Vitest for unit and service tests (same API as Jest), React Testing Library for components, Playwright for a few end-to-end checkout flows and for async Server Components, which unit test runners do not cover well. The reservation race-condition test runs against a real Postgres (Docker locally and in CI), not mocks. Database tests are `*.int.test.ts` files in a separate Vitest project run by `pnpm test:db`, each run using a throwaway database on the existing Postgres; `pnpm test` stays database-free (see decision note 0010).
- **CI/CD and jobs (v14):**
  - **CI** is GitHub Actions (`check`: format, lint, typecheck, unit and database tests; `e2e`: Playwright with one production build) on pull requests and once a week, not again after the merge: the rulesets on `main` require both checks with "branch must be up to date". Superseded pull request runs are cancelled. About 45% fewer runner minutes than before with the same coverage (decision note 0020, with the measurements and a recipe for a private repository).
  - **Deploys:** Vercel deploys every merge to `main` through its Git integration. The production build **applies pending database migrations to Neon first** (a deploy never goes live ahead of its schema), so migrations must be additive; previews never migrate (decision note 0019).
  - **Jobs:** one hourly job (`POST /api/jobs/hourly` behind a `JOBS_SECRET` bearer token: the seller reminder and the retry of unsent mails) is called by a **Cloudflare Worker** cron trigger (free plan), not by GitHub Actions (scheduled workflows are switched off after 60 days without repository activity) or Vercel Cron (once a day on Hobby). It records its last run, and the admin warns when none is recorded for 3 hours (decision note 0018, `docs/hourly-job.md`).
  - **Backups (v15):** a GitHub Actions workflow (`workflow_dispatch` only, started once a day by the same Cloudflare Worker) dumps the production database through a read-only Neon role, encrypts it with `age` against a public key, and stores it in a private R2 bucket (30-day lock rule, 35-day expiry). The private key stays with the developer, never in GitHub or Cloudflare, so leaked CI secrets cannot read a backup. R2 has no write-only token, so the workflow's token is Object Read and Write on that one bucket, and the lock rule protects recent copies. A restore script refuses to write into a database the shop uses or into one that already has tables, and the admin warns when the workflow has not reported a stored backup for 36 hours (decision note 0021, `docs/backup.md`).
- **Hosting:** Vercel Hobby (see 9 for the terms caveat). Avoid Vercel-only features (Blob, Edge Config, Vercel Cron, image optimization).

## 11. Milestones **(v15)**

Order: the working shop comes first. The transactional core (cart, reservation, checkout, orders) is the riskiest part, so it is built before the read-only catalog refinements (filters, sorts, search).

Each milestone ends with a short written note on the design choices made and why (kept in `docs/decisions/`), and meets the definition of done in section 1.

- **M0 Setup:** repo (public), Next.js, SCSS and CSS Modules, Docker Postgres, CI, AGENTS.md, linting and formatting, test setup, `docs/decisions/`, locale routing with the Czech messages file, `.env.example` and env-driven config.
- **M1 Catalog read path:** Drizzle schema (book, genre, book-genre, book-image), database integration test setup, seed data (about 30 invented books covering every status), catalog page reading from the database with visible statuses (reserved badge, sold within 14 days), book detail page with `/books/<id>/<slug>`, redirect and 404 for hidden books. No pagination, filters or add-to-cart yet (the button is a disabled placeholder at most).
- **M2 Admin:** Better Auth login (one admin level, two script-created accounts), phone-first add/edit book with the browser-side resize and presigned upload pipeline (up to 5 photos, placeholder), status management.
- **M3 Cart and reservation:** client cart, server validation, lazy-expiry reservation logic with tests for the race condition.
- **M4 Checkout and payment:** pickup and Zásilkovna options, order creation, SPAYD QR generation, order page with token, cash on pickup, `PaymentConfirmer` with the manual implementation.
- **M5 Orders and notifications:** admin order management, "mark paid", "write to buyer", `SellerNotifier`, the hourly job (seller reminder and retry, called by a Cloudflare Worker), and the encrypted daily backup with a restore script and an admin warning. Built, with the first restore rehearsal passed on 2026-10-20. The shop works end to end.
- **M6 Filters, sorts, search:** server-side, URL-synced, on top of the working shop. Built: search with `unaccent` and `pg_trgm`, genre, condition, language, price and availability filters, five sorts with Czech order, numbered pages of 24, a no-results state, and an end-to-end test of the flow (decision note 0022). The seed data (26 listed books, two pages, all genres and languages) needed no change. The accessibility pass by hand is part of M7.
- **M7 Launch prep:** legal pages for the chosen scenario, hosting terms resolved, SEO (including a canonical link for filtered catalog views), accessibility pass (including the catalog filter form on a phone, by keyboard), production deploy checks (migrations already run in the Vercel build, decision note 0019), a real test purchase and payment, and the first mail marked as not junk in the seller's mailbox.
- **M8 Handover:** rehearsal (restore the latest backup into a throwaway Neon project with `pnpm backup:restore`, as in `docs/backup.md`, deploy a second Vercel project from CI, run a full checkout against it), then move production to the seller's accounts.

## 12. Later ideas **(v14)**

- Buyer emails (confirmation with payment details, payment received, shipped) through a transactional email service, sending from `lucys-bookshop.cz`
- CSV statement import, then Raiffeisenbank Premium API if available for her account type
- Zásilkovna pickup-point widget with server-side validation, and API: **after release**, once the seller has a Packeta API key (until then buyers get a link to Packeta's map and an example), then a CSV export of orders in Packeta's import format
- Telegram bot as a second channel for seller notifications, after launch
- English content
- Buyer accounts and order history
- ISBN-scan from phone camera
- AI-assisted: draft listing descriptions from title and photos (and alt texts for the photos, together with the SEO work in M7), natural-language search ("a cozy fantasy under 150 CZK"), similar-book recommendations (pgvector is available on Neon). Nothing is reserved for these in v1.
- Split of shared title data from per-copy rows (see section 7)
- Wishlist and "notify me when similar books are added"
- Discount for buying several books
- Automatic buyer reminder before a reservation expires
- Additional condition grades

## 13. Open questions **(v15)**

Decided so far: payments, reservation, backend shape, database, ORM, auth and admin approach, sold and reserved visibility, condition grades, internationalization, shipping, accounts and handover, email deferral, duplicate copies, URL and slugs, image pipeline, styling, component approach, working agreement, AI features after v1, seller notification by email, encrypted daily backups, cash on pickup extension by seller only, working shop name and visual direction.

Still open:

**Legal (gate before launch)**

- Trader or private seller (section 9): deferred on purpose. It must be settled before going live (M7), together with the Vercel Hobby terms question.

**Tooling to confirm** (treated as defaults unless changed)

- Forms and data fetching approach, and the testing stack (section 10)

**Later**

- Art direction. The shop name and URL are settled (v13): `lucys-bookshop.cz`.
- The image address once the domain exists (a subdomain, or served by the app).
- Zásilkovna flat price: the amount is set in admin before launch.

## 14. Decisions log

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | Payment by QR bank transfer to Raiffeisenbank, manual confirmation; CSV import or bank API deferred                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-02 | Reservation 48h, lazy expiry, silent relist, no buyer reminder in v1                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-02 | Seller gets a reminder about 24h after checkout for unpaid orders                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-02 | Modular monolith in Next.js with a framework-free service layer                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-02 | Neon free plan for Postgres (assumed), Drizzle as ORM (confirmed)                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-02 | GitHub Actions for CI, deploy, and scheduled jobs                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-02 | Develop on Vercel Hobby, keep portable, images probably on Cloudflare R2                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-02 | Czech UI for v1, prepared for English                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-02 | Better Auth for admin (Auth.js is in maintenance mode); two users, owner and seller; custom admin, no CMS                                                                                                                                                                                                                                                                                                                             |
| 2026-10-02 | Sold books visible 14 days, reserved books with badge                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-02 | Two condition grades (`like_new`, `used`) plus optional note                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-02 | Shipping: personal pickup (cash on pickup possible) and manual Zásilkovna with a fixed flat price; Czech Republic only                                                                                                                                                                                                                                                                                                                |
| 2026-10-02 | Develop on developer's accounts, production on seller's accounts after testing; single public repo, GitHub Actions deploy with a token from her Vercel account                                                                                                                                                                                                                                                                        |
| 2026-10-02 | No custom domain for now; no buyer emails in v1; seller notified via `SellerNotifier`; order page with token                                                                                                                                                                                                                                                                                                                          |
| 2026-10-04 | One Book row per copy in v1, with a documented path to a Title/Copy split later                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-04 | URL `/books/<id>/<slug>`: random short id is the key, slug computed from the title, redirect to canonical                                                                                                                                                                                                                                                                                                                             |
| 2026-10-04 | Up to 5 photos per book, placeholder when none, editable after upload; resize in the browser into three renditions, served through a custom `next/image` loader                                                                                                                                                                                                                                                                       |
| 2026-10-04 | Developer writes only setup; Claude writes code in small PRs; developer reviews with CI as the first gate; ADR note per milestone                                                                                                                                                                                                                                                                                                     |
| 2026-10-04 | CSS Modules with SCSS, no Tailwind, no component library for now                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-04 | AI features are after v1, nothing reserved in the architecture                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-04 | Seller notified by email to her own address via `SellerNotifier`; only the seller can extend a cash-on-pickup reservation                                                                                                                                                                                                                                                                                                             |
| 2026-10-04 | Legal status (trader vs private seller) deferred until before launch                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-04 | Milestones reordered: admin, cart, checkout and orders come before filters, sorts and search (now M6)                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-04 | Working title "Lucy's Bookshop"; working prototype first with very light, almost brutalist but accessible styling; art direction later                                                                                                                                                                                                                                                                                                |
| 2026-10-08 | Catalog pagination deferred to M6; hidden books return 404 on the detail page                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-08 | No automatic cleanup of hidden books; admin gets a status filter and a guarded manual delete (refused if ordered); `updatedAt` added to Book                                                                                                                                                                                                                                                                                          |
| 2026-10-08 | Database tests in a separate `integration` Vitest project (`pnpm test:db`) with a throwaway database per run (ADR 0010); `reservedByOrderId` waits for M3                                                                                                                                                                                                                                                                             |
| 2026-10-08 | Genre labels live in `messages/cs.json` under `Genres.<key>`; M1 seed is about 30 invented books                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-08 | Deploy applies pending migrations to Neon (M7); until then run by hand before merging (the M1 page failed on Vercel: no tables)                                                                                                                                                                                                                                                                                                       |
| 2026-10-08 | Admin has one level, no owner/seller roles; two accounts (developer, seller) created by script, sign-up disabled, session checked in every admin action (M2)                                                                                                                                                                                                                                                                          |
| 2026-10-09 | Admin list shows "last changed" (from `updatedAt`), not time in status; an exact `statusChangedAt` waits for the stale-hidden flag. Hide works only on available books, show only on hidden ones; reserved and sold have no toggle                                                                                                                                                                                                    |
| 2026-10-16 | Only hidden books can be deleted, after a confirmation dialog; sold books are never deleted. Bulk delete is left for later                                                                                                                                                                                                                                                                                                            |
| 2026-10-16 | Project conventions live in `AGENTS.md` (read by Codex and other agents); `CLAUDE.md` only imports it                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-17 | Shop photos use a plain `<img>` with `srcset` of the three renditions instead of `next/image`; the book page shows photos in a carousel (drag, buttons, arrow keys, a counter that stays put; Embla Carousel); covers are cropped to 3:4 on cards; shared links carry the cover as Open Graph image; saved photos get a one-year immutable Cache-Control; AI-written alt texts wait for the SEO work                                  |
| 2026-10-18 | Shop name agreed and domain `lucys-bookshop.cz` bought; connected to production at M7, buyer emails still after v1; registration owner to settle before M8                                                                                                                                                                                                                                                                            |
| 2026-10-18 | M3: cart is a page showing the subtotal only (shipping at checkout); `orders` tables and `reservedByOrderId` in M3; `reserveBooks` locks rows in id order and checks before writing; cart keeps only book ids and seen prices in the browser (ADR 0016)                                                                                                                                                                               |
| 2026-10-18 | M4: one transaction places an order and charges the server's prices, comparing the book and shipping prices the buyer saw; number = year × 10000 + sequence; checkout key, `SELLER_IBAN`, Postgres rate limit, Zásilkovna only once priced (ADR 0017)                                                                                                                                                                                 |
| 2026-10-19 | Domain registration (Active24, DNS on Websupport) stays with the developer as domain maintainer, so it is not part of the M8 handover; Resend is verified on the domain                                                                                                                                                                                                                                                               |
| 2026-10-19 | CI runs on pull requests and weekly, not after the merge (rulesets require `check` and `e2e`, up to date); one production build per run; superseded runs cancelled (note 0020)                                                                                                                                                                                                                                                        |
| 2026-10-19 | M5 order actions: only Zásilkovna orders ship (tracking number required, fixable later), a pickup goes paid to completed, completing is manual; a refund frees the books by itself; cancel also works on expired orders; the seller extends a cash reservation by 48 h; mark paid, cancel and refund ask first (note 0018)                                                                                                            |
| 2026-10-19 | M5 seller notifications: email through Resend on the verified lucys-bookshop.cz (no sandbox sender); new-order mail sent after checkout at least once and retried, reminder at most once, plain text without buyer contact details; Telegram as a second channel after launch (note 0018)                                                                                                                                             |
| 2026-10-19 | M5 hourly job: POST /api/jobs/hourly behind a secret, called by a Cloudflare Worker cron (not GitHub Actions: 60-day rule; not Vercel Cron: daily on Hobby); the admin warns when no run is recorded for 3 hours (note 0018)                                                                                                                                                                                                          |
| 2026-10-19 | Migrations run in the Vercel production build, additive only (a test enforces it), with a lock, one transaction and an emergency switch; previews never migrate (note 0019)                                                                                                                                                                                                                                                           |
| 2026-10-19 | Zásilkovna: buyers get a link to Packeta's pickup point map and an example now; the widget with server-side validation waits until after release, for the seller's Packeta API key                                                                                                                                                                                                                                                    |
| 2026-10-20 | M5 backups: daily encrypted `pg_dump` (age, public key in CI, private key held by the developer) to a private R2 bucket with a 30-day lock and 35-day expiry, started by the Cloudflare Worker through `workflow_dispatch`; no write-only R2 token exists, so Object Read and Write on one bucket plus the lock; the restore script refuses live and non-empty databases; the admin warns after 36 hours without a report (note 0021) |
| 2026-10-20 | M6 catalog: the URL is the only state; search with `unaccent` + `pg_trgm` in Postgres; genres match any; available books first in every sort; numbered pages of 24; year and format filters deferred (note 0022)                                                                                                                                                                                                                      |
| 2026-10-20 | M6 built: views with a search, filters or another sort are `noindex, follow` (canonical link left to M7); the page redirects to the short URL; Czech sort uses the ICU collation, with a migration that fails the build if it is missing (note 0022)                                                                                                                                                                                  |
