# 0003. React Compiler enabled

Date: 2026-10-05
Status: accepted
Milestone: M0

## Context

The codebase is new, so there is no existing manual memoization to migrate. Fewer `useMemo`, `useCallback` and `React.memo` calls means less code to review.

## Decision

Enable the React Compiler with `reactCompiler: true` in `next.config.ts`. The `babel-plugin-react-compiler` package is a dev dependency, pinned to `1.0.0`.

## Alternatives considered

- Not enabling it and memoizing by hand: considered. Enabling the compiler is more seamless, leaves fewer memo calls to review, and suits a fresh codebase.

## Consequences

- Don't add `useMemo`, `useCallback` or `React.memo` without a measured reason.
- With React Hook Form, use `useWatch`, not `watch()`. React Hook Form is not installed yet.
- Reversible: set `reactCompiler` to `false` in `next.config.ts` to turn it off.
