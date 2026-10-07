# 0008. Testing: Vitest, Testing Library and Playwright

Date: 2026-10-06
Status: accepted
Milestone: M0

## Context
The project has three kinds of code to test: plain logic, React components, and async Server Components. Vitest can't run async Server Components, so those need a different layer. Note 0005 covers the Vitest setup for the service layer.

## Decision
Use three layers:
- Unit tests for logic: Vitest, `node` environment, `*.test.ts`.
- Component tests: Vitest with Testing Library, `jsdom` environment, `*.test.tsx`.
- End-to-end tests: Playwright, `e2e/*.spec.ts`, covering async Server Components. Chromium only at first.

## Consequences
- `vitest.config.mts` defines two projects, `unit` (`src/**/*.test.ts`, node) and `components` (`src/**/*.test.tsx`, jsdom, with `vitest.setup.ts`). `pnpm test` runs both.
- `pnpm test:e2e` runs `playwright test`. `playwright.config.ts` has one project, `chromium`, and starts the app itself: `pnpm dev` locally, `pnpm build && pnpm start` when `CI` is set.
- An async Server Component gets an e2e test, not a component test.
- Prefer `getByRole` queries and never use fixed sleeps.
- Other browsers are not tested. Add them to `projects` in `playwright.config.ts` if that becomes a problem.
- Database tests are still separate, and the reservation race-condition test runs against a real Postgres (see 0005).
