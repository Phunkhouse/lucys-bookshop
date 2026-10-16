# 0013. Project conventions live in AGENTS.md

Date: 2026-10-16
Status: accepted
Milestone: M2

## Context

The conventions (commands, stack, architecture, testing, workflow) were in `CLAUDE.md`, which imported `AGENTS.md` with `@AGENTS.md` (0004). `AGENTS.md` only held the Next.js block that `next dev` keeps up to date. The repo should work with other coding agents too, in particular Codex. Codex reads `AGENTS.md` from the repo, with a combined size limit of 32 KiB by default (the file is about 6 KB). I could not confirm that Codex follows `@` imports, so relying on `CLAUDE.md` to pull in `AGENTS.md` is safe for Claude Code, but for Codex only the conventions that are in `AGENTS.md` itself are certain to be read.

## Decision

- `AGENTS.md` holds everything: the Next.js block first, then the project conventions.
- `CLAUDE.md` contains the import `@AGENTS.md` and a one-line pointer to it, so Claude Code reads the same text and anyone who opens the file knows where the instructions are.
- The conventions are worded for any coding agent, not for one product ("Coding agents never bypass the pre-commit hook").

## Alternatives considered

- Keep the conventions in `CLAUDE.md` and copy them into `AGENTS.md`: two copies drift apart.
- Make `AGENTS.md` a symlink to `CLAUDE.md` (or the reverse): symlinks are awkward on Windows and in some tools, and `next dev` writes into `AGENTS.md`.
- Configure Codex per user to read `CLAUDE.md` (fallback file names): it works only on the machines where someone sets it up, so the repo would not be friendly by itself.

## Consequences

- One copy to maintain. Edit `AGENTS.md`, never `CLAUDE.md`.
- `next dev` replaces only the text between its own markers in `AGENTS.md` and leaves the conventions alone (checked in `node_modules/next/dist/server/lib/generate-agent-files.js`).
- 0004 still stands for the layout; its sentence that `CLAUDE.md` imports `AGENTS.md` is still true.
- Keep `AGENTS.md` well under 32 KiB, and put the most important rules first if it ever grows.
- Revisit if Codex or another agent needs a different file name, or if `CLAUDE.md` needs Claude-specific instructions (put those in `CLAUDE.md` below the import).
