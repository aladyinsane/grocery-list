# ADR-0008: Automatic item categorization

**Status:** Accepted
**Date:** 2026-09-07

## Context

This is the feature that started the whole project, alongside sync. iOS Reminders sorted a
grocery list into aisles by itself, and doing without it is the difference between walking
a shop once and zig-zagging back for the yoghurt you scrolled past.

The list currently renders in the order things were typed, which is the order they were
*remembered* in — not the order you encounter them. Categorization is what turns a list of
things into a route through a building.

What makes this decision non-obvious is that the app already has hard constraints from
earlier ADRs, and the naive implementations break them:

- **Offline is normal, not an error** ([principle 4](../PRINCIPLES.md), ADR-0005). Anything
  that categorizes over the network fails in exactly the place the app is most used: a shop
  with no signal.
- **Two taps to add an item** ([principle 3](../PRINCIPLES.md)). Anything that adds latency
  between typing and seeing the item on screen is a regression, not a feature.
- **Zero recurring cost, zero expiring credentials** ([principle 6](../PRINCIPLES.md)).
  Anything needing an API key adds a bill and something that can lapse — the exact class of
  dependency that broke the thing we replaced.

So the interesting question is not "how do we categorize" but "how do we categorize without
giving back any of the properties we just spent five ADRs securing."

## Decision

We will categorize **on the client, at the moment an item is added**, and store the result
as a **synced field on the item** rather than computing it at render time.

That single choice does most of the work: an offline add is categorized instantly with no
network, and because the category is data rather than a derived view, both phones agree by
the same mechanism that already makes the name and checked state agree.

### Where a category comes from

Three sources, in order, first hit wins:

1. **This household's own history.** If an item with the same normalized name has existed
   in this list before, reuse its category — including from a tombstone. If you corrected
   "oat milk" to Dairy & Eggs last week, this week's "oat milk" is Dairy & Eggs without
   being asked again.
2. **A static dictionary** of a few hundred common grocery items, shipped in the app.
   Matching is on the normalized string first, then on individual words with the longest
   match winning, so "2% milk" and "organic whole milk" both find "milk".
3. **"Other"**, when neither knows.

History-based learning is deliberately best-effort: the client looks in the replica it
already has, so a client rebuilt by a full resync has forgotten. It costs about fifteen
lines and no new storage, and when it misses, the dictionary is still there.

### The categories

Nine, in the order you walk a shop, with "Other" always last:

> Produce · Bakery · Dairy & Eggs · Meat & Fish · Frozen · Pantry · Drinks · Household · Other

Empty ones are hidden. Within a category, items stay in the order they were entered, and
checked items stay where they are rather than jumping — the existing behavior, for the same
reason: a list that rearranges itself under your thumb mid-aisle is disorienting.

### The rules live in `packages/shared`

Not in the web app, even though only the web app needs them today. ADR-0002 committed us to
Siri via a shortcut that posts text to `/api/quick-add`, and an item added by voice has no
client to categorize it — the Worker will have to. Putting the dictionary and the matching
rules in the shared package now means one implementation, one set of tests, and no chance of
the two halves disagreeing about where bread goes.

### Schema

`category TEXT` and `category_updated_at INTEGER` on `items`, as an additive migration, plus
a `setCategory` mutation. The extra clock is not decoration: it makes the category merge
independently of the name and checked state, exactly as ADR-0005 requires, so moving an item
to another aisle cannot resurrect a stale name or un-check it.

Items that predate the migration keep a null category and render under "Other". We are not
backfilling them — a grocery list turns over completely every week, so the problem disposes
of itself within one shop.

## Consequences

**Good:**

- Categorization is instant and works with no signal, because it is a lookup in memory.
- It costs nothing to run and adds no credential that can expire.
- Corrections stick, and mostly stick for next time too.
- The categories sync between phones with no new machinery, because they ride the mutation
  protocol that already exists.
- Siri gets categorization for free when it arrives, rather than needing a second
  implementation.

**Bad, and we accept it:**

- **The dictionary will be wrong sometimes**, and "Other" will have real things in it. The
  correction is one tap and it is remembered, which we judge a better failure mode than a
  slower or more expensive one that is wrong less often.
- **Headers add visual weight to a short list.** Five items across four categories is mostly
  headings. We are grouping unconditionally anyway: predictable beats clever, and a list
  that sometimes groups and sometimes doesn't is a concept to learn
  ([principle 3](../PRINCIPLES.md)).
- **The bundle grows** by a few kilobytes gzipped. Measurable but not perceptible against an
  app that already precaches its shell.
- **A new synced field is a new thing that can conflict.** Mitigated by giving it its own
  clock, but it is one more merge path to keep right.
- **Two phones on different app versions could hold different dictionaries.** In practice
  only the phone that adds an item assigns its category, so they cannot disagree after the
  fact — but it means the dictionary is not a single source of truth, and we should not
  later write code that assumes it is.

## Alternatives considered

### An LLM call to categorize unrecognized items

The obvious modern answer, and the one worth rejecting explicitly because it will keep
coming up. Send anything the dictionary doesn't know to a model, get back an aisle.

Rejected on four counts, any one of which would be enough:

- It needs the network at add time, which breaks the offline case that is the app's whole
  point in a shop ([principle 4](../PRINCIPLES.md)).
- It puts latency between typing and seeing ([principle 3](../PRINCIPLES.md)).
- It costs money per call and needs an API key — a recurring cost and an expiring credential,
  which is precisely the shape of dependency that broke iOS Reminders for us
  ([principle 6](../PRINCIPLES.md)).
- The long tail it is meant to cover is small. Two people buy roughly the same eighty things
  forever; a few hundred dictionary entries plus learned corrections should reach almost all
  of it.

The honest counter is that we are guessing at that last point. So this is deferred rather
than dead: if "Other" is still routinely occupied after a month of real shopping, that is
evidence, and a fallback becomes worth reconsidering in a new ADR — most likely applied
asynchronously after the item is already on screen, so it never delays an add.

### Categorizing on the server

One implementation, one dictionary, no client bundle cost, and the category is authoritative.

Rejected because an offline add would then be uncategorized until the phone reconnects,
which either shows the wrong aisle for a while or blocks the add. Both are worse than a
locally computed answer that is occasionally wrong. Note that the Worker will still hold the
same rules for Siri — the rules being shared is what makes that cheap.

### Computing the category at render time instead of storing it

Tempting: no schema change, no migration, no new field to merge, and updating the dictionary
would silently re-categorize everything.

Rejected because a manual correction has nowhere to live. As soon as you can move an item,
the category is user data, and user data belongs in the row. It would also mean two phones
on different app versions rendering the same list differently, which is a quiet way for the
list to stop being one shared thing.

### Letting the user define their own aisles

More faithful to how a specific shop is laid out. Rejected for now as a settings screen,
which is the thing [principle 3](../PRINCIPLES.md) exists to prevent. Per-store aisle
ordering is already noted in `../ROADMAP.md` if we ever want it.
