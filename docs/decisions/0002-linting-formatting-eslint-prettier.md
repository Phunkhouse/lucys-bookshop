# 0002. Linting and formatting: ESLint + Prettier

Date: 2026-10-05
Status: accepted
Milestone: M0

## Context

The project needs a linter and a formatter that cover TypeScript, JSX, accessibility and SCSS (CSS Modules), and that can enforce the architecture rule that `src/server/` imports nothing from `next` or `react`.

## Decision

Use ESLint for linting and Prettier for formatting. Prettier is pinned to an exact version (`3.9.9` in `package.json`) and configured in `.prettierrc` with `semi: false` and `singleQuote: true`, carried over from existing convention.

A Husky pre-commit hook runs `lint-staged`, which formats staged files with Prettier. The hook is a convenience. CI is the real gate.

## Alternatives considered

- Biome: rejected. The author already knows ESLint from work and considers it the industry standard.

## Consequences

- Type-aware rules are available through ESLint with typescript-eslint.
- `jsx-a11y` rules come with `eslint-config-next`, which `eslint.config.mjs` already extends. Accessibility is a project requirement, so keep them on.
- Prettier formats SCSS, so one formatter covers the styles.
- `no-restricted-imports` can block `next` and `react` imports under `src/server/`.
- Not yet in `eslint.config.mjs`: the type-aware rules and the `src/server/` restriction. Add them in a separate PR.
- Exact pin means formatting changes only when Prettier is upgraded on purpose. Upgrade in its own PR, because it may reformat many files.
- Run `pnpm lint` and `pnpm format:check` before finishing.
- The pre-commit hook (`.husky/pre-commit`, config in `.lintstagedrc.json`) runs `prettier --write` on staged files. It does not run ESLint, type checks or tests.
- CI (`.github/workflows/ci.yml`) runs `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` on pull requests and pushes to `main`. A commit that skipped the hook still has to pass these.
- Escape hatches for the hook: `git commit --no-verify` for one commit, or `HUSKY=0` in the environment (for example `HUSKY=0 git commit`). Use them when the hook is in the way, not to push unformatted code, since CI will fail on it.
- The hook is a convenience, not a guarantee. The developer can bypass it (`git commit --no-verify`, `HUSKY=0`), so CI runs `format:check` as the real gate. The agent is instructed never to bypass it (see `CLAUDE.md`).
