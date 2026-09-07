# Working in this repo

A shared grocery list for two people. Read `docs/PRINCIPLES.md` first — it's short, and it
decides most arguments.

## The one thing that matters

This app replaces an iOS Reminders list that started failing silently when an iCloud
account filled up. **Sync reliability outranks every other feature**, and the app must
never display a list it isn't sure about without saying so. If a change makes the app
prettier, faster, or cleverer at the cost of either of those, it's the wrong change.

The other constant: one of the two users is not tech savvy and has no interest in
becoming so. No login screens, no settings, no concepts to learn. If a feature needs
explaining, the feature is wrong.

## Process

- **Significant decisions get an ADR before they get code.** Write it, get it reviewed,
  then implement it in a separate PR that names it. See
  `docs/adr/0001-record-architecture-decisions.md`, and copy `docs/adr/0000-template.md`.
- **ADRs are immutable once accepted.** Changed your mind? New ADR, mark the old one
  superseded. Don't edit history.
- **Record the alternatives you rejected and why.** That's the part that's valuable later.
- **Small PRs.** One ADR's worth of work at a time.
- Ideas that aren't ready go in `docs/ROADMAP.md` rather than into the code.

### The documentation check

Before opening a PR, go through this list and say in the PR what you found. The question
for each is **"is this still true?"**, not "did I touch it?" — the docs that go wrong are
the ones nobody edited.

| Document | Ask |
|---|---|
| `README.md` | Does the status still describe where the project actually is? |
| `docs/adr/` | Is there a decision in this PR that needs an ADR? Is the index current? |
| `docs/SETUP.md` | Would a non-technical reader still succeed following it *exactly*? |
| `docs/OPERATIONS.md` | Do the commands still work? Is there a new one worth writing down? |
| `docs/ROADMAP.md` | Does this ship, defer, or decline something on it? |
| `apps/*/README.md` | Do they still describe what is in the directory? |
| `CLAUDE.md` | Did this PR establish a convention that belongs here? |

**Don't write down facts that drift.** Test counts, version numbers, "you are here"
markers — all of these have already gone stale in this repo, some of them twice. Either
something checks the fact automatically or it does not belong in prose.

`npm run check:docs` covers the mechanical part: broken relative links, ADRs missing from
the index, stated test counts, and British spellings. It runs in CI. It cannot tell whether
a sentence is still true, which is what the table above is for.

Occasionally a British word is *data* rather than prose — the aisle dictionary lists
"courgette" so that typing it finds the right shelf. Mark those regions rather than
weakening the check:

```
check-docs: allow-british:start — and say why
...
check-docs: allow-british:end
```

Keep the region tight. Exempting a whole file would quietly let real British prose in
alongside the data.

## Decisions already made — read before proposing otherwise

| ADR | Decision | The thing people forget |
|---|---|---|
| 0002 | PWA, not a native iOS app | TestFlight builds expire every 90 days; that's the exact failure mode we're escaping |
| 0003 | Cloudflare Workers + D1, one origin | Supabase's free tier pauses after 7 days idle — disqualifying for principle 1 |
| 0004 | Secret link, no accounts | The threat model is *friction*, not attackers. It's a grocery list |
| 0005 | Polling on a revision cursor, not websockets | A cursor can't miss an update; a dropped socket message can. And you'd need the cursor anyway for reconnect |
| 0006 | Custom domain, `groceries.laurenchaplinski.com` | The host is frozen into every home screen icon, so it had to be settled before anyone installed. workers.dev stays live as the fallback |
| 0008 | Categorize on the client at add time, stored as a synced field | Not computed at render: a manual correction has to live somewhere, and an offline add has to be categorized with no network |

## Layout

```
docs/          principles, ADRs, setup/operations guides
packages/shared/   domain types, wire protocol, and the aisle rules -- shared so the
               Worker and the PWA cannot disagree (ADR-0008)
apps/api/      Cloudflare Worker: API, D1 schema, serves the built PWA
apps/web/      the PWA: React + TypeScript + Vite
scripts/       icon generation, the documentation check
shortcuts/     the Siri shortcut (ADR-0007, not yet written)
```

npm workspaces. `npm run typecheck`, `npm test`, `npm run build` from the root.

## Conventions

- TypeScript strict everywhere. Types shared between the Worker and the PWA live in
  `packages/shared` so the two halves of the protocol can't drift.
- Comments explain *why*, and cite the ADR when the reasoning lives there. The code says
  what it does; the comment says what it's defending against.
- The sync merge logic must stay pure and unit-testable without a network.
- Anything touching sync gets the two-device manual check as well as unit tests: add on A,
  check off on B, airplane mode, edit both, reconnect, confirm both phones converge with
  nothing lost or duplicated.
- American English spelling throughout — docs, comments, and UI copy alike ("behavior",
  "recognize", "optimization").
- Prefer the boring option. We are two people and a grocery list.
