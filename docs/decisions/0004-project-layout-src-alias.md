# 0004. Project layout: src/ and @/* alias

Date: 2026-10-05
Status: accepted
Milestone: M0

## Context

The project needs a clear place for application code, kept apart from the config files at the repo root, and a place for the service layer.

## Decision

Keep all application code in `src/`, with the import alias `@/*` mapped to `src/*` (`paths` in `tsconfig.json`). The service layer lives in `src/server/`. `CLAUDE.md` imports `AGENTS.md` with `@AGENTS.md`.

## Consequences

- Config files stay at the repo root; code stays under `src/`.
- Business logic goes in `src/server/`, which imports nothing from `next` or `react`. That rule is not enforced by lint yet (see 0002).
- Import with `@/server/...` instead of long relative paths.
- Vitest resolves the alias through `tsconfig.json` (`resolve.tsconfigPaths` in `vitest.config.mts`) and runs tests in `src/**/*.test.ts`.
- `AGENTS.md` is re-added by `next dev`. Importing it from `CLAUDE.md` keeps one copy of those instructions, so don't copy its contents into `CLAUDE.md`.
