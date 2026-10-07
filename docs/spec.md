# Used Books E-shop: Spec v6

Status: decisions from the first to fourth iteration rounds (2026-10-02 to 2026-10-04) are merged in. Sections that changed from v5 are marked **(v6)**; earlier version marks are kept as history. Remaining open items are in section 13.

## 1. Purpose **(v4)**

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
- **High-scrutiny review areas** (read line by line): the reservation transaction, order and total calculation, SPAYD generation, auth and role checks on admin routes, database migrations, image upload verification, and anything touching secrets or CI deploy tokens.
- **Low-scrutiny areas** (skim, rely on CI and a visual check): styling, copy, boilerplate.
- **A second pair of eyes:** after Claude writes a PR, a separate review pass (a fresh Claude session or subagent that has not seen the writing) checks it against the spec before the developer reads it.
- **Definition of done per milestone:** CI green, tests for the risky logic, checked on a real phone, and a short "why this design" note in `docs/decisions/`.
- **CLAUDE.md** in the repo holds conventions (folder layout, the framework-free service layer rule, naming, testing rules, what never to commit) so every session starts from the same rules.

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
- **Two admin users:** the developer (owner) and the seller (seller role). The developer lists books at first, then hands the work to the seller and keeps access.
- **Payment: QR bank transfer to the seller's Raiffeisenbank account, confirmed manually by the seller in admin; or cash on personal pickup.**
- **Reservation window: 48 hours, expired reservations are released silently.**
- **No custom domain for now.** The shop lives at a free `<name>.vercel.app` address.
- **No emails to buyers in v1** (they need a verified sending domain). The seller contacts buyers herself. The seller is notified about new orders (see 6.8).
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

- Custom domain and emails to buyers (confirmation, payment received, shipped)
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

### 6.1 Catalog (the "one pager")

- Grid or list of book cards: cover photo (or placeholder), title, author, price, condition, genre tags, status badge.
- **Filters:** genre (multi-select), price range, condition, language, availability. Optionally publication year and format.
- **Sorts:** newest first (default), price low-high, price high-low, title A-Z, author A-Z.
- **Search:** text search across title and author (and ISBN).
- Filter and sort state lives in the URL query string, so views are shareable and the back button works.
- Show result count and a clear "reset filters" action. Show a friendly empty state.
- Pagination or "load more". Server-side filtering.
- **Visible statuses:** available books, reserved books (badge "Rezervováno"), and books sold within the last **14 days** (badge "Prodáno"), so the shop looks active. Sold and reserved books cannot be added to the cart. Available books sort first.
- This is computed in the query (`status = 'sold' AND soldAt > now() - 14 days`), with no job. Older sold books disappear from the catalog and the sitemap, but their detail page still works with a sold notice, so shared links never break.
- A book counts as available if it is `available`, or `reserved` with an expired reservation (see 6.4).

### 6.2 Book detail **(v4)**

- Photo gallery, title, author, description, genre, language, condition (with its note), ISBN, price.
- Add-to-cart button (disabled with a clear message if reserved or sold).
- **URL shape: `/books/<id>/<slug>`.** The `<id>` is a random short id (6-8 lowercase base36 characters) and is the only part used for lookup. The `<slug>` is computed from the current title (Czech characters transliterated, capped at about 60 characters) and is cosmetic. If the slug in the URL does not match the current title, the page redirects permanently to the canonical URL, so editing a title never breaks shared links.
- Rendered as a page for SEO and sharing.

### 6.3 Cart

- Each book can be in the cart once.
- Cart stored client-side (localStorage), always **re-validated on the server** at checkout: items still available, prices current.
- Cart drawer or page, showing items, subtotal, shipping, and total.
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

### 6.5 Checkout

- Guest checkout: name, email (so the seller can write to the buyer), phone, shipping details.
- **Shipping options (v1):**
  - _Personal pickup_ (free), payable by bank transfer or **in cash on pickup**.
  - _Zásilkovna_ (Czech Republic only), handled manually: the buyer enters the pickup point as text, the price is a **fixed flat rate editable in admin**, and the seller creates the parcel in the Zásilkovna app and pastes the tracking number into admin. Pickup-point widget and API automation come later.
- Order summary before submitting.
- Required checkboxes: agreement with terms, acknowledgement of privacy policy.
- On submit: server validates cart, calculates totals, creates the order, reserves the books, and shows the **order page** at an unguessable link (`/order/<token>`) with QR code, account number, amount, variable symbol, and deadline. For cash on pickup the page shows the pickup instructions instead of the QR code. The buyer is told to bookmark or screenshot the page, since there is no confirmation email.
- No redirect to an external provider and no card data anywhere.

### 6.6 Payments

- **QR platba** in the Czech SPAYD format, generated server-side from the order (account IBAN, amount, variable symbol, message). No external payment service.
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

### 6.8 Notifications (replaces transactional emails in v1) **(v5)**

- **To the seller:** new order or reservation (including cash on pickup), and the reservation-expiring reminder (about 24h after checkout, unpaid orders only, once per order).
- Payment itself is seen in her bank app. The app cannot know about it until she marks it paid.
- **Delivered by email to the seller's own address (v5)** through a `SellerNotifier` interface. The planned implementation uses a free provider's sandbox sender, which can deliver only to the email of the provider account owner, so the production provider account must be registered with her address (during development, notifications go to the developer's own address). To verify in a short spike at M5: reliability of the sandbox sender, spam-folder behavior, and a fallback (a single verified sender address on another free provider). A Telegram bot stays an option behind the same interface.
- **Buyers receive no emails in v1.** An `EmailSender` interface is added later together with a custom domain and a verified sending domain.

### 6.9 Admin area **(v4)**

**Essential. Without it the seller can't run the shop.** Built as part of the app, not as a CMS, because the admin is the business logic (reservations, orders, payments).

- Login with **Better Auth**, invite-only, two roles: `owner` (developer) and `seller`. Auth.js is in maintenance mode and not used.
- Add/edit book form: title, author, genres, language, condition, condition note, description, price, ISBN, **photos (up to 5, reorderable, can be added, replaced or removed at any time)**.
- A listing can be saved **without photos**. It shows a "photos coming soon" placeholder to buyers and a "no photos" flag in admin.
- **Phone-first listing flow:** camera input for photos, resize in the browser, upload straight to object storage with a presigned URL, minimal required fields.
- Nice to have: ISBN lookup to prefill title/author/cover (Open Library or Google Books API).
- Responsive for both phone and desktop.
- Book list with status (available, reserved, sold, hidden), quick toggle to hide.
- Orders list and detail: status changes, "mark paid", extend reservation, expiring-soon flag, notes, "write to buyer".
- Settings: Zásilkovna flat price, pickup instructions.

### 6.10 Static and legal pages

- About/contact page, shipping and payment info, terms and conditions, privacy policy, cookie notice (if analytics or marketing cookies are used).
- Wording depends on the seller's legal status (section 9).

## 7. Data model (draft) **(v4)**

- **Book**: id, **shortId** (random, unique, immutable; used in the URL; the slug is computed from the title and not stored), title, author, isbn (indexed, not unique), description, language, condition (`like_new` | `used`), conditionNote, priceMinor (integer), currency, status (available | reserved | sold | hidden), reservedUntil, reservedByOrderId, createdAt, soldAt
- **Genre**: id, key, slug (labels live in the messages files)
- **BookGenre**: bookId, genreId (many-to-many)
- **BookImage**: id, bookId, **baseKey** (object storage key prefix; the three renditions live under it), position, width, height
- **Order**: id, number (also the variable symbol), publicToken, status, paymentMethod, email, name, phone, shipping details (including pickup-point text), shippingMethod, shippingCostMinor, totalMinor, locale, expiresAt, sellerRemindedAt, trackingNumber, note, createdAt, paidAt
- **OrderItem**: id, orderId, bookId, titleSnapshot, priceMinorSnapshot
- **Users and sessions**: managed by Better Auth, with a role field
- **Settings**: Zásilkovna flat price, pickup instructions

Notes: store money as integers, never floats. Add database indexes on status, reservedUntil, soldAt, genre join, and price. Use database transactions when reserving and marking sold. Full-text search via Postgres. The image base URL is an environment variable.

**Duplicate copies:** one `Book` row per physical copy (duplicated metadata is accepted in v1). If it becomes a nuisance, split into a shared `Title` (title, author, ISBN, description, cover) and per-copy `Book` rows by adding a nullable `titleId` and backfilling by ISBN. Reservation and orders already work on the copy, so they do not change.

## 8. Non-functional requirements

- **Performance:** fast on mobile; images pre-sized and lazy-loaded; pages cached where possible.
- **SEO:** server-rendered catalog and book pages, titles and meta descriptions, Open Graph images, sitemap, structured data (Book/Product).
- **Accessibility:** semantic HTML, keyboard navigation, contrast, alt text for covers.
- **Security:** validate all input (Zod), rate-limit checkout and login, secure admin routes, protect the scheduled-job endpoint with a secret, secrets in environment variables, HTTPS, unguessable order tokens.
- **Reliability:** managed database with scheduled backups (Neon's free history window is short, so a scheduled `pg_dump` is part of the plan); error tracking and basic logs.
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
- **No custom domain for now.** Create the production Vercel project in the seller's account with its final name and share only that address.
- **One public repository** in the developer's GitHub. Deployment to the seller's Vercel project runs from **GitHub Actions** with a deploy token from her account. Her secrets live in repository secrets.
- Handover steps: Vercel (new project in her account via CI), Neon (restore a `pg_dump` into her project), Cloudflare R2 (copy objects and update the base URL env var), update secrets.
- **Public repo hygiene:** seed data is invented books, never her real listings; no secrets, bank account number, or personal data in the repo.

Also: privacy policy and cookie rules (GDPR); QR payments need only the seller's account number, no provider onboarding.

## 10. Tech stack and architecture **(v5)**

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
- **Images (decided):** Cloudflare R2 (probable), presigned uploads from the browser. Photos are resized **in the browser at upload** into three renditions (about 480px thumb, 960px medium, 1600px large, WebP or JPEG), handling EXIF orientation, and stored under `books/<bookId>/<imageId>/`. The database stores one base key. `next/image` is used with a small custom loader that picks the nearest pre-made rendition, so no Vercel image optimization quota is used and the code works on any host. The server checks each uploaded object (type and size) before attaching it to a book. Not Vercel Blob.
- **Auth (admin only):** Better Auth with an owner role and a seller role
- **Internationalization:** a locale-routing library for the App Router (next-intl is the likely choice), Czech with no URL prefix and English later under `/en`. All UI text in `messages/cs.json`. Money and dates formatted with `Intl`. Book titles, authors, and descriptions are not translated; genres and condition labels are translated through keys. `locale` is stored on the order.
- **Testing (proposed):** Vitest for unit and service tests (same API as Jest), React Testing Library for components, Playwright for a few end-to-end checkout flows and for async Server Components, which unit test runners do not cover well. The reservation race-condition test runs against a real Postgres (Docker locally and in CI), not mocks.
- **CI/CD and jobs:** GitHub Actions for lint, typecheck, test, build, and **deploy to Vercel** with a token; plus scheduled workflows for (1) the seller reminder, calling a secret-protected endpoint every hour or so (runs can be delayed slightly), and (2) a periodic database backup.
- **Hosting:** Vercel Hobby (see 9 for the terms caveat). Avoid Vercel-only features (Blob, Edge Config, Vercel Cron, image optimization).

## 11. Milestones **(v6)**

Order: the working shop comes first. The transactional core (cart, reservation, checkout, orders) is the riskiest part, so it is built before the read-only catalog refinements (filters, sorts, search).

Each milestone ends with a short written note on the design choices made and why (kept in `docs/decisions/`), and meets the definition of done in section 1.

- **M0 Setup:** repo (public), Next.js, SCSS and CSS Modules, Docker Postgres, CI, CLAUDE.md, linting and formatting, test setup, `docs/decisions/`, locale routing with the Czech messages file, `.env.example` and env-driven config.
- **M1 Catalog read path:** Drizzle schema, seed data (fake books), catalog page reading from the database with visible statuses (reserved badge, sold within 14 days), book detail page with `/books/<id>/<slug>` and redirect.
- **M2 Admin:** Better Auth login with two roles, phone-first add/edit book with the browser-side resize and presigned upload pipeline (up to 5 photos, placeholder), status management.
- **M3 Cart and reservation:** client cart, server validation, lazy-expiry reservation logic with tests for the race condition.
- **M4 Checkout and payment:** pickup and Zásilkovna options, order creation, SPAYD QR generation, order page with token, cash on pickup, `PaymentConfirmer` with the manual implementation.
- **M5 Orders and notifications:** admin order management, "mark paid", "write to buyer", `SellerNotifier`, scheduled seller-reminder workflow, backup workflow. After this milestone the shop works end to end.
- **M6 Filters, sorts, search:** server-side, URL-synced, on top of the working shop. Must be done before launch.
- **M7 Launch prep:** legal pages for the chosen scenario, hosting terms resolved, SEO, accessibility pass, CI deploy, a real test purchase and payment.
- **M8 Handover:** rehearsal (restore the latest backup into a throwaway Neon project, deploy a second Vercel project from CI, run a full checkout against it), then move production to the seller's accounts.

## 12. Later ideas

- Custom domain, then buyer emails (confirmation with payment details, payment received, shipped) through a transactional email service
- CSV statement import, then Raiffeisenbank Premium API if available for her account type
- Zásilkovna pickup-point widget and API
- English content
- Buyer accounts and order history
- ISBN-scan from phone camera
- AI-assisted: draft listing descriptions from title and photos, natural-language search ("a cozy fantasy under 150 CZK"), similar-book recommendations (pgvector is available on Neon). Nothing is reserved for these in v1.
- Split of shared title data from per-copy rows (see section 7)
- Wishlist and "notify me when similar books are added"
- Discount for buying several books
- Automatic buyer reminder before a reservation expires
- Additional condition grades

## 13. Open questions **(v5)**

Decided so far: payments, reservation, backend shape, database, ORM, auth and admin approach, sold and reserved visibility, condition grades, internationalization, shipping, accounts and handover, email deferral, duplicate copies, URL and slugs, image pipeline, styling, component approach, working agreement, AI features after v1, seller notification by email, cash on pickup extension by seller only, working shop name and visual direction.

Still open:

**Legal (gate before launch)**

- Trader or private seller (section 9): deferred on purpose. It must be settled before going live (M7), together with the Vercel Hobby terms question.

**Tooling to confirm** (treated as defaults unless changed)

- Forms and data fetching approach, and the testing stack (section 10)

**Later**

- Final shop name, art direction, and the URL (`<name>.vercel.app`; the name must be available).
- Zásilkovna flat price: the amount is set in admin before launch.

## 14. Decisions log

| Date       | Decision                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | Payment by QR bank transfer to Raiffeisenbank, manual confirmation; CSV import or bank API deferred                                                             |
| 2026-10-02 | Reservation 48h, lazy expiry, silent relist, no buyer reminder in v1                                                                                            |
| 2026-10-02 | Seller gets a reminder about 24h after checkout for unpaid orders                                                                                               |
| 2026-10-02 | Modular monolith in Next.js with a framework-free service layer                                                                                                 |
| 2026-10-02 | Neon free plan for Postgres (assumed), Drizzle as ORM (confirmed)                                                                                               |
| 2026-10-02 | GitHub Actions for CI, deploy, and scheduled jobs                                                                                                               |
| 2026-10-02 | Develop on Vercel Hobby, keep portable, images probably on Cloudflare R2                                                                                        |
| 2026-10-02 | Czech UI for v1, prepared for English                                                                                                                           |
| 2026-10-02 | Better Auth for admin (Auth.js is in maintenance mode); two users, owner and seller; custom admin, no CMS                                                       |
| 2026-10-02 | Sold books visible 14 days, reserved books with badge                                                                                                           |
| 2026-10-02 | Two condition grades (`like_new`, `used`) plus optional note                                                                                                    |
| 2026-10-02 | Shipping: personal pickup (cash on pickup possible) and manual Zásilkovna with a fixed flat price; Czech Republic only                                          |
| 2026-10-02 | Develop on developer's accounts, production on seller's accounts after testing; single public repo, GitHub Actions deploy with a token from her Vercel account  |
| 2026-10-02 | No custom domain for now; no buyer emails in v1; seller notified via `SellerNotifier`; order page with token                                                    |
| 2026-10-04 | One Book row per copy in v1, with a documented path to a Title/Copy split later                                                                                 |
| 2026-10-04 | URL `/books/<id>/<slug>`: random short id is the key, slug computed from the title, redirect to canonical                                                       |
| 2026-10-04 | Up to 5 photos per book, placeholder when none, editable after upload; resize in the browser into three renditions, served through a custom `next/image` loader |
| 2026-10-04 | Developer writes only setup; Claude writes code in small PRs; developer reviews with CI as the first gate; ADR note per milestone                               |
| 2026-10-04 | CSS Modules with SCSS, no Tailwind, no component library for now                                                                                                |
| 2026-10-04 | AI features are after v1, nothing reserved in the architecture                                                                                                  |
| 2026-10-04 | Seller notified by email to her own address via `SellerNotifier`; only the seller can extend a cash-on-pickup reservation                                       |
| 2026-10-04 | Legal status (trader vs private seller) deferred until before launch                                                                                            |
| 2026-10-04 | Milestones reordered: admin, cart, checkout and orders come before filters, sorts and search (now M6)                                                           |
| 2026-10-04 | Working title "Lucy's Bookshop"; working prototype first with very light, almost brutalist but accessible styling; art direction later                          |
