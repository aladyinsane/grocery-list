## What this changes

<!-- One or two sentences. What is different after this merges? -->

## Which ADR does this implement?

<!--
Link it, e.g. docs/adr/0005-offline-first-sync-protocol.md

If this PR *is* a new ADR, say so.
If it's a small fix that needs no ADR, say "none needed" — but if it changes how the app
works in a way we'd want to remember the reasoning for, write the ADR first (ADR-0001).
-->

## How it was tested

<!--
Automated: what did you add or run?
Manual: for anything touching sync, the two-device checklist in docs/SETUP.md territory —
add on A, check off on B, airplane mode, reconnect, converge.
-->

## Anything to look at closely

<!-- Tradeoffs made, things you weren't sure about, follow-ups deliberately left out. -->

## Checklist

- [ ] Serves the [principles](docs/PRINCIPLES.md) — especially #1 (sync reliability) and #3 (stays simple)
- [ ] CI green, including `npm run check:docs`

### Documentation check

Went through the list in `CLAUDE.md`. The question is *"is this still true?"*, not *"did I
touch it?"* — say what you checked, including the ones that needed nothing.

- [ ] `README.md` — status still accurate
- [ ] `docs/adr/` — no undocumented decision here; index current
- [ ] `docs/SETUP.md` — a non-technical reader would still succeed following it exactly
- [ ] `docs/OPERATIONS.md` — commands still work; nothing new worth writing down
- [ ] `docs/ROADMAP.md` — updated if this ships, defers or declines something
- [ ] `apps/*/README.md` — still describe what's in the directory
- [ ] `CLAUDE.md` — no new convention that belongs here

<!-- Anything you changed, and anything you deliberately left alone: -->
