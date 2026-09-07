# grocery-list

A shared grocery list for two people, that actually syncs.

We used a shared list in iOS Reminders for years. It worked well — items sorted themselves
into aisles, Siri could add things hands-free, and it appeared on both phones instantly —
right up until one iCloud account filled up and sync started failing quietly. A grocery
list that *looks* current and isn't is worse than no list at all; you find out at the shop.

So this app has one job, and everything else is negotiable: **the list is the same on both
phones, and when it isn't, the app says so.**

## What it is

A web app you add to your iPhone home screen. It gets an icon, opens full screen, works
without signal, and syncs when you're back on. There's no login — the link *is* the
credential — so setup for the less technically inclined member of the household is: tap a
link, tap "Add to Home Screen." Once, forever.

Free to run, nothing to renew, nothing that expires and needs reinstalling.

## Status

**In daily use.** Add items, check them off, edit them, clear the done pile — on two phones,
offline, with a status line that tells you the truth about whether you're synced. The
two-device behavior has been confirmed on real hardware, not just in tests: both phones
converge, an airplane-mode session drains when signal returns, and nothing is lost or
duplicated.

| | |
|---|---|
| Principles and ADRs 0001–0005 | shipped |
| The working list: Worker + D1 + PWA + sync | shipped |
| Custom domain ([ADR-0006](docs/adr/0006-serve-from-a-custom-domain.md)) | shipped |
| Automatic categorization into aisles ([ADR-0008](docs/adr/0008-automatic-item-categorization.md)) | decided, not yet built |
| Siri, via an Apple Shortcut (ADR-0007) | not yet decided |

`docs/ROADMAP.md` has everything after that, including what we've deliberately declined.

## How it's built

| | |
|---|---|
| **Front end** | React + TypeScript + Vite, as an installable PWA — [ADR-0002](docs/adr/0002-pwa-instead-of-native-ios-app.md) |
| **Back end** | Cloudflare Worker + D1, serving the app from the same origin — [ADR-0003](docs/adr/0003-cloudflare-workers-and-d1.md) |
| **Access** | A secret link per household, no accounts — [ADR-0004](docs/adr/0004-secret-household-link-authentication.md) |
| **Sync** | Offline-first, operation-based, cursor-pulled — [ADR-0005](docs/adr/0005-offline-first-sync-protocol.md) |
| **Address** | `groceries.laurenchaplinski.com`, a Cloudflare custom domain — [ADR-0006](docs/adr/0006-serve-from-a-custom-domain.md) |

```
docs/          principles, ADRs, setup and operations guides
packages/      shared/  — domain types and the wire protocol
apps/          api/     — the Cloudflare Worker: API, D1, serves the PWA
               web/     — the PWA: React + TypeScript + Vite
scripts/       icon generation
shortcuts/     the Siri shortcut (PR 4)
```

## Start here

- **[docs/PRINCIPLES.md](docs/PRINCIPLES.md)** — the values every decision is argued against
- **[docs/adr/](docs/adr/)** — why the system is shaped the way it is, including what we rejected
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — what's coming, what's deliberately not
- **[docs/SETUP.md](docs/SETUP.md)** — installing it on a phone
- **[docs/OPERATIONS.md](docs/OPERATIONS.md)** — deploying and looking after it

## Developing

```
npm install
npm run typecheck   # src and tests
npm test            # 64 tests
npm run build
```

To run it locally, and to deploy, see [docs/OPERATIONS.md](docs/OPERATIONS.md).

## How we work

Significant decisions get an ADR before they get code. The ADR is reviewed first, then a
feature PR implements it and names it. ADRs are immutable — changing our minds means a new
one that supersedes the old. [ADR-0001](docs/adr/0001-record-architecture-decisions.md)
explains why.
