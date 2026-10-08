# 0009. Neon connection URL: sslmode=verify-full

Date: 2026-10-08
Status: accepted
Milestone: M0

## Context

The app connects to Neon (see 0006) with the `pg` package, currently `^8.23.1` in `package.json`. A connection URL can set `sslmode`. Per the warning emitted by pg-connection-string 8.x, The author expects `pg` v9 to change the meaning of `sslmode=require`.

## Decision

The Neon `DATABASE_URL` sets `sslmode=verify-full` explicitly. It does not rely on `require`, so the behavior stays the same when `pg` moves to v9.

## Consequences

- Use `?sslmode=verify-full` at the end of the Neon connection string, in every environment that connects to Neon.
- `.env.example` currently has only the local Docker URL, which has no `sslmode`. This note applies to the Neon URL only. When a Neon placeholder is added to `.env.example`, include `sslmode=verify-full` and never a real host or password.
- Don't change `sslmode` to `require` to fix a connection error. Find the cause instead.
- Revisit when upgrading `pg` to v9: read its release notes for the `sslmode` change and check that the connection still works.
