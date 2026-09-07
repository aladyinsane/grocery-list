# ADR-0005: Offline-first sync protocol

**Status:** Accepted
**Date:** 2026-09-07

## Context

This is the ADR that matters. Everything else in this repo is in service of the property
described here: **an item added on one phone appears on the other phone, always, and when
it hasn't yet, the app says so.** [Principles 1, 2 and 4](../PRINCIPLES.md).

The conditions we have to work under:

- **Grocery stores have terrible signal.** The single most important moment in this app's
  life — standing in an aisle, checking things off, adding the thing you just remembered —
  is the moment most likely to have no usable network. Offline is not an edge case here;
  it is the primary use case.
- **Both people edit at once.** One at home adding to the list, one at the store checking
  items off, is the normal pattern, not a rare conflict scenario.
- **iOS aggressively suspends and kills backgrounded web apps.** A phone in a pocket is a
  process that is going to be frozen and probably terminated. Anything held only in memory
  is gone.
- **Requests fail and get retried.** On a flaky connection, a request that appears to fail
  may in fact have succeeded. Naive retry produces duplicate items — the classic sync bug,
  and a maddening one on a grocery list.

The failure we are designing against is not "sync is slow." It is **sync is silently
wrong**: a list that looks complete and isn't. That is what iOS Reminders did to us, and
it's worse than an outage, because an outage is visible.

## Decision

We will implement a small, explicit, offline-first sync protocol. The server is the source
of truth; each client keeps a full local replica; changes flow as **operations**, not as
row overwrites; and clients **pull** changes on a monotonic cursor rather than depending on
messages being delivered.

Seven properties, each aimed at a specific way sync goes wrong.

### 1. Client-generated IDs

Item IDs are UUIDs generated on the phone, before the item ever reaches the network. The
server upserts by that ID.

*Kills:* duplicate items from retried requests. A mutation can be delivered any number of
times and the result is identical, because identity was decided before transmission. This
makes the entire protocol idempotent, which is what lets every other layer retry freely.

### 2. A durable mutation queue

Every change is appended to a queue persisted in `localStorage` **before** any network call,
and removed only once the server has acknowledged it.

*Kills:* changes lost to an app kill, a crash, a reboot, or a week in a dead zone. iOS can
terminate the app at any moment; the queue survives it. Nothing is ever "in flight" only in
memory.

### 3. Optimistic local apply

Mutations apply to the local replica immediately, and the UI renders from the local replica.
The network is never on the path between a tap and a pixel.

*Kills:* the spinner in the dairy aisle. Typing an item on one bar of signal is exactly as
fast as typing it on wifi. [Principle 4](../PRINCIPLES.md).

### 4. Per-field last-write-wins

Each item carries independent timestamps for its editable fields — `name_updated_at` and
`checked_updated_at` — and merging resolves each field separately, newest write wins.
Deletion is a tombstone with its own `deleted_at`.

*Kills:* the specific, infuriating bug where one person checks off "milk" while the other
renames it to "oat milk," and whole-row LWW makes one of those edits resurrect the other's
stale state. Field-level resolution means both edits survive: the item is renamed *and*
checked.

Concurrent edits to the *same* field still resolve by timestamp, and one of them loses.
That is unavoidable without a CRDT, and for two people editing a grocery list it is fine.

### 5. A monotonic revision cursor, not event delivery

Each household row carries a `revision` counter, incremented inside a transaction on every
write, and stamped onto every item touched. Clients ask `GET /api/list?since=<revision>`
and receive everything that changed after it.

*Kills:* lost updates from dropped connections. This is the load-bearing design choice, and
it's subtle: **there are no messages to lose.** A websocket push can be dropped by a
suspended radio, a dead tunnel, or a reconnect race, and the client will never know it
missed something. A cursor cannot miss anything — if the client's revision is behind, the
next poll returns the gap, whether that gap is one item or a hundred. Recovery from any
failure is the same code path as the normal case, which means it is tested every three
seconds rather than once a year.

It also means no reconnect logic, no heartbeat, no backoff state machine, no "is the socket
actually alive or just pretending" problem. [Principle 5](../PRINCIPLES.md).

### 6. Tombstones with 30-day retention, and automatic full resync

Deleted items become tombstones and are retained for 30 days before being purged. A client
arriving with a `since` cursor older than the retention window — or one the server doesn't
recognize — is told to discard its replica and take a full snapshot.

*Kills:* the zombie item. Without tombstones, a phone that was offline while an item was
deleted re-adds it on reconnect. Thirty days covers any realistic absence; the resync
fallback covers everything beyond it, including a phone whose storage Safari evicted.

### 7. Adaptive polling, and a status line that never lies

Polling cadence follows what the user is doing:

| State | Interval |
|---|---|
| App visible, interacted with in the last 2 minutes | ~3s |
| App visible, idle | ~10s |
| App backgrounded | stopped |

Plus an **immediate** sync on app focus, `visibilitychange`, and regained connectivity — so
picking the phone up is always a fresh read.

At two users this lands around 2,000 requests/day, comfortably inside Cloudflare's free
tier (ADR-0003).

And permanently on screen, the sync status: *Synced just now* / *Syncing…* / *Offline — 2
changes waiting*. [Principle 2](../PRINCIPLES.md): the app is never allowed to present a
list it isn't sure about without saying so. Three seconds of staleness that the user knows
about is fine. Three seconds of staleness they don't know about is how trust dies.

### Wire protocol

```
GET  /api/list?since=<revision>
  → { revision, items: [...], resync: false }
  → { revision, items: [...], resync: true }   // cursor too old; replace local replica

POST /api/mutations
  { mutations: [ { op, itemId, ...fields, clientTime } ] }
  → { revision, items: [...] }                  // items changed by this batch
```

Operations: `addItem`, `renameItem`, `setChecked`, `deleteItem`, `clearChecked`.

Both endpoints are idempotent and safe to retry.

## Consequences

**Good:**

- Correct under the conditions that actually occur: no signal, partial signal, both people
  editing, app killed mid-write, phone offline for two weeks.
- Failure recovery is the normal code path, so it's continuously exercised rather than
  being a rarely-run branch that has quietly rotted.
- Small enough to hold in your head — roughly 200 lines of protocol logic, all of it
  ordinary synchronous reasoning about timestamps and a counter. No distributed-systems
  library, no CRDT, no reconnect state machine.
- Unit-testable without a network: the merge function is pure, so concurrent-edit and
  duplicate-replay scenarios are ordinary table-driven tests.

**Bad, and we accept it:**

- **Up to ~3 seconds of latency** instead of the sub-second delivery a websocket gives.
  Imperceptible for a grocery list, and bought at the price of an entire category of bugs.
- **Polling burns a little battery and network** even when nothing changed. Bounded by
  stopping entirely when backgrounded.
- **Same-field concurrent edits lose one write.** A real CRDT would merge them. Not worth
  the complexity for two people and a shopping list.
- **Clock skew between phones affects tie-breaking.** Mitigated by the server stamping
  authoritative times and treating client timestamps as advisory; a phone with a badly wrong
  clock could still lose an edit it should have won. Acceptable — phones sync their clocks.
- **`localStorage` is not guaranteed durable on iOS.** Safari can evict it under storage
  pressure or long non-use. Mitigated by the server holding truth and the resync path
  rebuilding from scratch; the worst case is a re-download, never a data loss.
- **We own this code.** A bug in the merge logic is ours to find. This is the deliberate
  trade made in ADR-0003.

## Alternatives considered

### WebSockets via Durable Objects

The "proper" realtime answer, and Cloudflare makes it available. Rejected for
[principle 5](../PRINCIPLES.md): it requires reconnection logic, heartbeats, backoff, and
resumption-after-gap handling — and crucially, **you still need a cursor-based catch-up
path anyway** for the reconnect case, because a socket cannot prove it didn't miss
anything. So websockets are strictly additional machinery on top of what we're building,
in exchange for saving 3 seconds. The wrong trade today; a reasonable optimization later,
and it's on the roadmap.

### Server-Sent Events

Lighter than websockets and one-directional, which fits. Still rejected: SSE connections
die silently on mobile when the radio sleeps, and detecting that requires heartbeats and
reconnection — the same machinery, the same need for a catch-up cursor underneath. Same
trade, same conclusion.

### A ready-made sync engine (Yjs, Automerge, Replicache, ElectricSQL)

Correct, well-tested, and far more capable than what we're writing. Rejected on weight and
opacity: these bring substantial bundle size to an app whose whole value proposition is
opening instantly, and when something goes wrong the debugging surface is someone else's
CRDT internals rather than a timestamp comparison we can read.
[Principle 5](../PRINCIPLES.md) again — we would rather own a small thing than rent a
large one.

### Whole-row last-write-wins

Much simpler than per-field, and one fewer column. Rejected because it produces exactly one
bug, and that bug is the worst one available to us: checking an item off and watching it
come back unchecked because your partner renamed it a moment earlier. Users do not
experience that as "a conflict resolution nuance." They experience it as the app being
broken, and they stop trusting it — which is the whole thing we're trying to protect.

### Fetch the entire list every poll, no cursor

Genuinely tempting at this scale — the list is a few dozen rows, so the payload is
trivial, and it deletes the entire cursor mechanism. Rejected because it destroys the
ability to distinguish "this item was deleted remotely" from "this item was added locally
and hasn't uploaded yet." Without a cursor, reconciling a full snapshot against pending
local mutations requires reinventing the same bookkeeping, badly. The cursor is cheaper
than the alternative it replaces.
