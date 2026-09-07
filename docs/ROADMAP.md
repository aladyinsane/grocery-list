# Roadmap / Todos

Where ideas live before they become an ADR. Nothing here is committed to; the point is to
have a place to put a thought so it stops rattling around.

Grouped by **Next up** (planned, roughly in order), **Someday** (good ideas, no timeline),
and **Declined** (considered and deliberately not doing, with the reason — so we don't
relitigate it every six months).

---

## Next up

### Rate limiting on the API — a known gap against ADR-0004

ADR-0004 says requests are rate-limited per token. **They are not, as of PR 2.** Cloudflare's
per-Worker rate-limiting binding has had an unstable API, and depending on a moving target
for a defense-in-depth measure looked like the wrong trade against
[principle 5](PRINCIPLES.md) — so it was deferred deliberately rather than bodged.

Why this is tolerable for now: the token is 128 bits of randomness, so guessing one is not
something rate limiting meaningfully changes. What rate limiting actually buys is bounding
abuse if a link leaks, and cost protection — neither urgent at two users on a free tier.

Options when we come back to it: a WAF rate limiting rule at the zone level, Cloudflare's
per-Worker rate-limiting binding once it settles, or a counter column on the household row.
Should be a short ADR, since it revisits an accepted decision.

**ADR-0006 opened the WAF route** by moving us onto a custom domain, so this is now
reachable without further infrastructure work. Read the free tier honestly before counting
on it: it includes one rate limiting rule, IP-based fixed-window. That bounds a crude flood
from a single source, which is most of the practical value here — but it is not the
per-token limiting ADR-0004 actually specifies, so it narrows the gap rather than closing
it.

### Automatic categorization — ADR-0008
Items sort themselves into aisles (Produce, Dairy, Meat & Fish, Bakery, Frozen, Pantry,
Drinks, Household, Other), the way iOS Reminders did. The headline feature we're missing.

Planned approach: a static dictionary of common grocery items shipped in the app, matched
locally. Instant, free, works offline, no API key. Unknown items land in "Other"; dragging
an item to a different aisle teaches it, and that correction syncs to both phones.

Open question for the ADR: whether an LLM fallback for unrecognized items earns its keep,
or whether a good dictionary plus learned corrections covers the long tail. Lean: dictionary
only, revisit with real data on what actually lands in "Other."

### Siri — ADR-0007
"Hey Siri, Grocery" → "What are we adding?" → "milk and eggs." An Apple Shortcut that
dictates text and POSTs to `/api/quick-add`, which splits the phrase into separate items.
Distributed as an iCloud link — one tap to install on each phone. `/api/quick-add` is
reserved for this from v1.

The invocation phrase is the shortcut's name, so it's worth choosing carefully — see
ADR-0002 for why this is the compromise we accepted.

### Staples / "the usuals"
A saved list of things we buy every week, added to the list with one tap rather than typed
out every time. Probably the highest actual-daily-value item on this page after the two
above.

### Export
One tap to copy the whole list as plain text, so it can be pasted into a message. Satisfies
[principle 7](PRINCIPLES.md) and takes about twenty lines.

---

## Someday

**Item history and suggestions.** Typing "mi" suggests "milk" because we buy it constantly.
Cheap to build once we have history, and meaningfully faster than typing.

**Quantities.** "2× lemons." Deliberately left out of v1 because it complicates the add
flow, which is the thing we most need to keep at two taps.

**Undo.** Particularly for "clear checked" — currently destructive with no recovery. A
30-day tombstone window (ADR-0005) means the data is technically still there, so this is
mostly UI.

**Per-store aisle ordering.** The order categories appear in, arranged to match the route
through the shop we actually use. Only worth it once categorization exists.

**Notify me when you add something.** Blocked on two things: iOS web push is only available
to home-screen-installed PWAs and is not something ADR-0002 lets us depend on, and
ADR-0004 gives us no per-user identity to attribute an addition to. Would need both solved.

**Multiple lists.** Groceries / hardware store / pharmacy. Straightforward schema change,
but it adds a navigation layer to an app whose main virtue is not having one. Only if we
genuinely find ourselves wanting it.

**Recipe → list.** Paste a recipe, get its ingredients as items. Fun, and the kind of thing
that sounds better than it works in practice.

**Websocket push via Durable Objects.** Drops sync latency from ~3s to instant. Explicitly
rejected for v1 in ADR-0005, and worth revisiting only if 3 seconds ever actually annoys
us in real use. It probably won't.

**A third person.** Would force reconsidering ADR-0004's link-based access and the lack of
per-user identity.

**Native iOS app.** Only if true Siri App Intents and a home-screen widget become worth
$99/year and a release process. ADR-0002 has the full argument. The backend wouldn't need
to change.

---

## Declined

**Receipt scanning / barcode scanning.** Cool. Solves no problem we have.

**Price tracking or budgeting.** Different app. Would drag this one out of shape.

**Meal planning integration.** Tempting given the existing weekly meal plan, but coupling
two systems means either can break the other. If it ever happens, it should be one-way:
meal plan exports items *into* the grocery list, never the reverse.

**Accounts, profiles, settings screens.** Every one of these is a place for a non-technical
user to get stuck. [Principle 3](PRINCIPLES.md).

**Analytics.** Two users. We can just ask each other.

**Ads, sharing to social, "invite friends."** No.
