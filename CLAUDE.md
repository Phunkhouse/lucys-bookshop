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
- DB: Drizzle + Postgres. Schema changes only through generated migrations, never by hand-editing the database. Drizzle is on v1 (rc). Use the v1 docs and APIs, not 0.x patterns.

## Architecture

- Business logic lives in `src/server/` and imports nothing from `next` or `react`.
- Route handlers and server actions are thin: parse input with Zod, call a service, return.
- Integrations sit behind interfaces: `PaymentConfirmer`, `SellerNotifier` (later `EmailSender`).
- Never trust prices or totals from the browser. Recalculate on the server.
- Reservation expiry is lazy (query-based). No job frees books.
- Don't use Vercel-only features (Blob, Edge Config, Vercel Cron, image optimization).
- Planned folders may not exist yet. Create them when first needed, don't invent others without asking.
- Components live in src/components/<Name>/ with <Name>.tsx, <Name>.module.scss, <Name>.test.tsx and an index.ts that re-exports. Named exports only (default exports only for Next route files). No barrel files that re-export many components.

## UI and i18n

- All UI text goes in `messages/cs.json`. No hard-coded Czech or English strings in components.
- The shop name comes from one config value, never hard-coded.
- Accessibility: semantic HTML, visible focus, WCAG AA contrast, alt text, large touch targets.

## Testing

- Vitest for unit/service tests, Playwright for a few end-to-end flows. *.test.ts = unit (node), _.test.tsx = component (jsdom), e2e/_.spec.ts = Playwright.
- Prefer getByRole queries. Never use fixed sleeps in tests.
- The reservation race-condition test runs against a real Postgres, not mocks.
- For risky logic (reservations, totals, SPAYD, access control), write the test cases first and wait for approval before implementing.

## Workflow

- One concern per branch and PR. Never push to `main`.
- Keep PRs small. Describe what changed and why in the PR body.
- Don't add dependencies without saying why in the PR.
- Prettier runs on staged files in a pre-commit hook (husky + lint-staged). Never use --no-verify
- Ask before changing the spec's decisions. Propose the change instead.
- PR titles use Conventional Commits (feat:, fix:, docs:, test:, ci:, build:, style:, refactor:).
- Open PRs with gh pr create using a Conventional Commits title. Never merge. The developer merges after review.

## Never commit

- Secrets, `.env*` (except `.env.example`), bank account numbers, personal data.
- Real listings or photos. Seed data is invented.
