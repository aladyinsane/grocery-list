# ADR-0001: Record architecture decisions

**Status:** Accepted
**Date:** 2026-09-07

## Context

This is a small, two-person app that will be worked on in short bursts, months apart,
often with the help of an AI assistant that starts each session with no memory of the
last one. The risk is not that we make bad decisions; it's that we make reasonable
decisions, forget why, and then undo them.

We already know we're going to make several decisions that look arbitrary from the
outside and are not: polling instead of websockets, a secret URL instead of a login, a
web app instead of a native one. Each of those will look like laziness to a reader who
doesn't know the constraints. Each one deserves its reasoning written down next to it.

[Principle 8](../PRINCIPLES.md) — small PRs, one ADR per real decision.

## Decision

We will keep Architecture Decision Records in `docs/adr/`, in the style described by
Michael Nygard: numbered markdown files, one decision each, with Context, Decision,
Consequences, and Alternatives considered.

An ADR is written and reviewed **before** the code that implements it. The implementing
pull request names the ADR it satisfies. ADRs are immutable once accepted — a change of
mind is a new ADR that supersedes the old one, never an edit to the original.

`docs/adr/README.md` carries the index and the conventions. `docs/adr/0000-template.md`
is the starting point for new records.

## Consequences

- Every significant decision has a written rationale, including the options we rejected,
  which is the part that's genuinely hard to reconstruct later.
- Review happens at the point where changing your mind is cheap — before implementation
  rather than during it.
- A new contributor (human or AI) can read `docs/adr/` in ten minutes and understand the
  shape of the system and why it's shaped that way.
- It costs something. Writing an ADR takes real time, and for a two-person grocery list
  that overhead is only worth it for genuinely significant decisions. Deciding what
  counts as significant is a judgement call we will sometimes get wrong in both directions.
- There is a risk of ADRs drifting out of date with the code. The mitigation is the
  supersession rule plus the PR template's requirement to name an ADR.

## Alternatives considered

### Nothing — just write good commit messages

Commit messages explain a change; they don't explain a decision that spans many changes,
and they're nearly impossible to search for intent. "Why don't we use websockets?" is
not a question a git log answers well.

### A single long DESIGN.md

Easier to write, much harder to keep honest. A living document gets edited to match the
current state of things, which silently destroys the record of what we used to think and
why we changed. The immutability of numbered ADRs is the whole point.

### A wiki or Notion page

Splits the documentation from the code it describes, so it can't be reviewed in the same
PR, can't be diffed, and rots out of sight. Documentation that isn't in the repo isn't
part of the repo.
