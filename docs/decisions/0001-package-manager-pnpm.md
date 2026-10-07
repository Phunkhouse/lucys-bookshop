# 0001. Package manager: pnpm

Date: 2026-10-05
Status: accepted
Milestone: M0

## Context

The project needs one package manager used the same way by everyone.

## Decision

Use pnpm, pinned in `package.json` (`"packageManager": "pnpm@12.9.1"`). It gives a strict `node_modules`, a security model where dependency install scripts must be approved, and a single lockfile, `pnpm-lock.yaml`.

## Consequences

- Strict `node_modules`: only dependencies declared in `package.json` can be imported.
- Dependency install scripts need approval. Run `pnpm approve-builds` to approve or deny them. Approvals are stored under `allowBuilds` in `pnpm-workspace.yaml`, where `sharp`, `@parcel/watcher` and `unrs-resolver` are currently `false`. Explain any change to that list in the PR.
- One lockfile only. Never create `package-lock.json`; if one appears, delete it.
- Commands from the Next.js docs assume npm, so use the pnpm equivalents.
