# Decision notes

Short notes explaining why the project is built the way it is. Each milestone ends with at least one note (see "Definition of done" in `docs/spec.md`).

A note is for a decision that someone might reasonably ask about later: a tool choice, a data model shape, a trade-off. Typo fixes and routine code don't need one.

## Naming

`NNNN-short-title.md`, numbered in the order written, for example `0001-package-manager-pnpm.md`. Never renumber. If a decision changes, write a new note and mark the old one as superseded.

## Format

```md
# NNNN. Title

Date: YYYY-MM-DD
Status: accepted | superseded by NNNN | deprecated
Milestone: M0

## Context

What problem or question came up? What constraints applied
(free tier, portability, accessibility, review effort)?

## Decision

What we chose, in one or two sentences.

## Alternatives considered

- Option A: why not
- Option B: why not

## Consequences

What gets easier, what gets harder, what to revisit and when.
```

Keep each note under one page.

## Writing notes

- Record only what was actually decided and why. Use the reasons given by the author.
- List only alternatives that were really considered. If none were given, ask.
- Check any claim about the repo (config values, file names, versions) against the repo before writing it.
- Don't state numbers, limits or behavior from memory. Verify them or leave them out.
- Keep it under one page. Prefer concrete consequences ("run X") to general ones.
