# 0002. Linting and formatting: ESLint + Prettier

Date: 2026-10-05
Status: accepted
Milestone: M0

## Context

The project needs a linter and a formatter that cover TypeScript, JSX, accessibility and SCSS (CSS Modules), and that can enforce the architecture rule that `src/server/` imports nothing from `next` or `react`.

## Decision

Use ESLint for linting and Prettier for formatting. Prettier is pinned to an exact version (`3.9.9` in `package.json`) and configured in `.prettierrc` with `semi: false` and `singleQuote: true`, carried over from existing convention.

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
