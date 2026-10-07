@AGENTS.md

# Lucy's Bookshop: project conventions

Used-books shop, one seller, one copy per listing. Full spec: `docs/spec.md`.
Decision notes: `docs/decisions/`. The repo is public.

## Stack and tooling

- Package manager: pnpm only. Never create `package-lock.json`.
- Next.js App Router, TypeScript strict, `src/` directory, import alias `@/*` -> `src/*`.
- Styling: CSS Modules + SCSS. Design tokens are CSS custom properties. No Tailwind, no component library.
- Lint/format: ESLint + Prettier. Run `pnpm check` before finishing.
- React Compiler is enabled. Don't add `useMemo`, `useCallback`, `React.memo` without a measured reason. With React Hook Form use `useWatch`, not `watch()`.
- Validation: Zod, shared between client and server. Money is integer minor units (`priceMinor`), never floats.
- DB: Drizzle + Postgres. Schema changes only through generated migrations, never by hand-editing the database.

## Architecture

- Business logic lives in `src/server/` and imports nothing from `next` or `react`.
- Route handlers and server actions are thin: parse input with Zod, call a service, return.
- Integrations sit behind interfaces: `PaymentConfirmer`, `SellerNotifier` (later `EmailSender`).
- Never trust prices or totals from the browser. Recalculate on the server.
- Reservation expiry is lazy (query-based). No job frees books.
- Don't use Vercel-only features (Blob, Edge Config, Vercel Cron, image optimization).
- Planned folders may not exist yet. Create them when first needed, don't invent others without asking.

## UI and i18n

- All UI text goes in `messages/cs.json`. No hard-coded Czech or English strings in components.
- The shop name comes from one config value, never hard-coded.
- Accessibility: semantic HTML, visible focus, WCAG AA contrast, alt text, large touch targets.

## Testing

- Vitest for unit/service tests, Playwright for a few end-to-end flows.
- The reservation race-condition test runs against a real Postgres, not mocks.
- For risky logic (reservations, totals, SPAYD, access control), write the test cases first and wait for approval before implementing.

## Workflow

- One concern per branch and PR. Never push to `main`.
- Keep PRs small. Describe what changed and why in the PR body.
- Don't add dependencies without saying why in the PR.
- Ask before changing the spec's decisions. Propose the change instead.

## Never commit

- Secrets, `.env*` (except `.env.example`), bank account numbers, personal data.
- Real listings or photos. Seed data is invented.
