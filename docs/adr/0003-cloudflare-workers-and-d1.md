# ADR-0003: Cloudflare Workers and D1 as the backend

**Status:** Accepted
**Date:** 2026-09-07

## Context

Two phones need a shared source of truth. Since we've chosen a PWA (ADR-0002), that source
of truth has to be a server we run — there is no iCloud-style sync fabric to lean on, which
is the point: the previous solution's sync depended on an unrelated storage quota, and this
one should depend on nothing but itself.

What we need is genuinely small: store a few hundred rows, serve a JSON API to two users,
and host a handful of static files. What we need it to *be* is more demanding:

- **Always up.** [Principle 1](../PRINCIPLES.md). A backend that is asleep when you're
  standing in the dairy aisle has failed at the only job it has.
- **Free, permanently, with nothing to renew.** [Principle 6](../PRINCIPLES.md).
- **Boring and debuggable.** [Principle 5](../PRINCIPLES.md).
- **Deployable in one command**, so fixing a bug is cheap.

## Decision

We will run the backend as a **Cloudflare Worker** with **D1** (Cloudflare's managed
SQLite) as the database, and we will serve the built web app from **the same Worker** using
Workers static assets.

One `wrangler deploy` publishes the API and the front end together, to one origin.

Concretely:

- `apps/api` is the Worker: the JSON API, the D1 schema and migrations, and the static
  asset binding that serves `apps/web`'s build output.
- Schema changes are versioned SQL files in `apps/api/migrations/`, applied with
  `wrangler d1 migrations apply`.
- Local development runs against a real local D1 via `wrangler dev` — the same SQLite
  engine as production, not a mock.

## Consequences

**Good:**

- **Never sleeps.** Workers are always warm at the edge; there is no cold-start-from-zero
  or free-tier idle suspension. This is the single most important property on the list.
- **Free tier is enormous relative to our use.** Two people polling a list use on the order
  of a couple of thousand requests a day against a six-figure daily allowance, and a
  database measured in kilobytes against a multi-gigabyte allowance. We will not
  accidentally get a bill.
- **One origin, one deploy.** No CORS configuration, no second hosting provider, no
  cross-service version skew between an API and a front end that were deployed separately.
  Every part of that is a class of bug we simply don't have.
- **It's SQLite.** Ordinary SQL, ordinary transactions, ordinary `.sql` migration files.
  Anyone can read it. `wrangler d1 execute --command "select * from items"` is the whole
  debugging story.
- **Trivially exportable**, which is [principle 7](../PRINCIPLES.md). It's a SQLite
  database; we can dump the whole thing.

**Bad, and we accept it:**

- **We write more code than a BaaS would need.** Supabase or Firebase would hand us
  realtime sync and auth off the shelf; here we implement the sync protocol ourselves
  (ADR-0005). We judge this a fair trade: the protocol is ~200 lines, we understand every
  line of it, and it has no vendor behaviour we can't inspect.
- **Vendor lock-in to Cloudflare's runtime.** The Worker uses Cloudflare's fetch handler
  and D1 bindings, so moving providers means rewriting the entry point and swapping the
  database driver. The business logic and schema are portable; the plumbing isn't. For a
  grocery list, acceptable.
- **Workers are not Node.** No filesystem, no arbitrary npm package that assumes Node
  built-ins, and a CPU-time limit per request. Our workload is a few SQL queries, so this
  costs us nothing in practice, but it does constrain library choice.
- **D1 is comparatively young.** It is generally available and appropriate for a workload
  this size, but it is not decades-proven Postgres. Our mitigation is that the data is
  small and trivially backed up; see `docs/OPERATIONS.md`.
- **A Cloudflare account is now a dependency**, and account access is a single point of
  failure for deployment.

## Alternatives considered

### Supabase (Postgres + Realtime)

The most tempting option: realtime subscriptions and auth for free, far less code than
we'll write. Rejected on one specific fact — **free-tier Supabase projects are paused after
a week of inactivity** and must be manually resumed. We'd probably use the list often
enough to stay under that, but "probably" is the wrong word to attach to
[principle 1](../PRINCIPLES.md). We are explicitly here because a background quota lapsed
and broke sync. Choosing a backend that can suspend itself would be repeating the mistake
with extra steps.

### Firebase / Firestore

Genuinely strong on the merits: excellent built-in offline persistence, realtime out of the
box, and a free tier that doesn't pause. Rejected for three reasons, none individually
decisive: it pulls a heavy SDK into a PWA where cold-start size is what "opens instantly"
means; its security-rules model is a second, unfamiliar language to get right for a use
case as simple as ours; and its document model plus opaque sync engine is much harder to
inspect when something goes wrong than a SQLite table you can `select *` from. This is
[principle 5](../PRINCIPLES.md) — we'd rather own 200 readable lines than delegate to a
sync engine we can't open up. Worth revisiting if our own protocol proves troublesome.

### A VPS running Node and Postgres

Total control, completely portable. Rejected because it costs money monthly and, worse,
requires maintenance: OS updates, TLS certificate renewal, process supervision, backups.
Every one of those is a thing that can lapse ([principle 6](../PRINCIPLES.md)), and a
lapsed thing is how we got here.

### Cloudflare Workers + KV instead of D1

KV is eventually consistent, with writes taking up to a minute to propagate globally. For
a two-person list that is *probably* fine, but "your husband's addition shows up in
sixty seconds, sometimes" is a bad property for the one feature we care about. D1 gives us
read-after-write consistency and real transactions for the revision counter that ADR-0005
depends on.

### Cloudflare Pages for the front end, Workers for the API

The conventional split. Rejected in favour of one Worker serving both, because two
deploy targets means CORS configuration, two URLs, and the possibility of a front end and
an API being at different versions. Fewer moving parts, per [principle 5](../PRINCIPLES.md).
