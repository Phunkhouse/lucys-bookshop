@AGENTS.md

# Lucy's Bookshop: project conventions

Used-books shop, one seller, one copy per listing. Full spec: `docs/spec.md`.
Decision notes: `docs/decisions/`. The repo is public.

## Commands

First-time setup: `pnpm install`, `cp .env.example .env` (set the password), `pnpm db:up`.

```sh
pnpm dev            # Next dev server on http://localhost:3000
pnpm build          # production build
pnpm start          # serve the production build

pnpm check          # lint + typecheck + test (no format check). Run before finishing, together with pnpm format:check.
pnpm format         # Prettier --write
pnpm format:check   # Prettier --check (CI runs this)
pnpm lint           # ESLint
pnpm typecheck      # runs `next typegen` first (route types are generated and git-ignored)
pnpm test           # Vitest: unit + component tests, no database needed
pnpm test:watch     # Vitest in watch mode
pnpm test:db        # Vitest integration tests (*.int.test.ts) on a throwaway database; needs pnpm db:up. CI runs it. Run it when touching schema or queries (pnpm check does not)
pnpm test:e2e       # Playwright (Chromium). First run: pnpm exec playwright install chromium

pnpm db:up          # start local Postgres (Docker)
pnpm db:down        # stop it, data is kept
pnpm db:generate    # generate a migration from schema changes
pnpm db:migrate     # apply migrations
pnpm db:ping        # verify the database connection
```

- Use only scripts that exist in `package.json`. Check it before inventing a command.
- Ask before `docker compose down -v` (it deletes all local database data).
- Never use `drizzle-kit push`. Schema changes go through `db:generate` and `db:migrate`.
- Scripts in `scripts/` start with `import 'dotenv/config'` and run with `tsx`.

## Stack and tooling

- Package manager: pnpm only. Never create `package-lock.json`.
- Next.js App Router, TypeScript strict, `src/` directory, import alias `@/*` -> `src/*`.
- Styling: CSS Modules + SCSS. Design tokens are CSS custom properties. No Tailwind, no component library.
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
- Components live in `src/components/<Name>/` with `<Name>.tsx`, `<Name>.module.scss`, `<Name>.test.tsx` and an `index.ts` that re-exports. Named exports only (default exports only for Next route files). No barrel files that re-export many components.

## UI and i18n

- All UI text goes in `messages/cs.json`. No hard-coded Czech or English strings in components.
- The shop name comes from one config value, never hard-coded.
- Accessibility: semantic HTML, visible focus, WCAG AA contrast, alt text, large touch targets.

## Testing

- Vitest for unit/service tests, Playwright for a few end-to-end flows. `*.test.ts` = unit (node), `*.int.test.ts` = database integration (real Postgres, `pnpm test:db`, ADR 0010), `*.test.tsx` = component (jsdom), `e2e/*.spec.ts` = Playwright.
- Prefer getByRole queries. Never use fixed sleeps in tests.
- The reservation race-condition test runs against a real Postgres, not mocks.
- For risky logic (reservations, totals, SPAYD, access control), write the test cases first and wait for approval before implementing.

## Workflow

- One concern per branch and PR. Never push to `main`.
- Keep PRs small. Describe what changed and why in the PR body.
- Don't add dependencies without saying why in the PR.
- Prettier runs on staged files in a pre-commit hook (husky + lint-staged). Claude never bypasses it: no `git commit --no-verify` or `-n`, no `HUSKY=0`. If the hook fails, fix the cause or ask.
- Ask before changing the spec's decisions. Propose the change instead.
- PR titles use Conventional Commits (feat:, fix:, docs:, test:, ci:, build:, style:, refactor:).
- Open PRs with gh pr create using a Conventional Commits title. Never merge. The developer merges after review.

## Never commit

- Secrets, `.env*` (except `.env.example`), bank account numbers, personal data.
- Real listings or photos. Seed data is invented.
