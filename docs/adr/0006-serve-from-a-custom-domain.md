# ADR-0006: Serve the app from a custom domain

**Status:** Accepted
**Date:** 2026-09-07

## Context

PR #2 deployed the app to `grocery-list.groc-list.workers.dev`. That hostname works, and
nothing about it is broken. The reason it needs a decision anyway is timing.

The host is not incidental here. ADR-0004 made the URL the credential, and ADR-0002 has
people install that URL to their home screen — so the hostname gets frozen into an icon on
someone's phone the first time they add it. Changing it afterwards means both people delete
the icon, follow the Share → Add to Home Screen steps again, and re-share the link. That is
precisely the interaction [principle 3](../PRINCIPLES.md) exists to avoid ever requiring.

**Right now, no icon exists.** The cost of choosing the permanent URL is zero today and
meaningfully annoying tomorrow. Leaving it alone is not neutral — it is choosing the
workers.dev hostname permanently, by default rather than deliberately.

Two other facts bear on it:

- The workers.dev hostname is composed from things we control poorly: the Worker's `name`
  and the account's workers.dev subdomain. The account subdomain in particular is not
  reliably self-serve to change once registered — the API refuses with error 10036, and
  people end up asking Cloudflare support to do it.
- ADR-0004 specified per-token rate limiting, which PR #2 did not implement (see
  `../ROADMAP.md`). Zone-level WAF rules are one route to closing that, and they are not
  available on a workers.dev hostname at all.

Lauren owns `laurenchaplinski.com`, already a Cloudflare zone on the same account.

## Decision

We will serve the app at **`groceries.laurenchaplinski.com`**, added as a Cloudflare Custom
Domain on the Worker. Cloudflare provisions the DNS record and TLS certificate itself.

`docs/SETUP.md` hands out this hostname and no other.

**The workers.dev hostname stays enabled** rather than being switched off. It costs nothing
and it is the fallback if the domain ever becomes unreachable — see Consequences.

We will not use the apex, `laurenchaplinski.com`: that would route the entire personal
domain to this Worker.

## Consequences

**Good:**

- **The URL is now stable against everything we were worried about.** Rename the Worker,
  change the account subdomain, move to another host entirely — `groceries.laurenchaplinski.com`
  keeps working, and nobody re-adds an icon.
- **It costs nothing to do now.** The same change after both phones are set up costs a
  re-onboarding of a user who has no interest in apps.
- **It opens the zone-level WAF route.** Cloudflare's free plan includes one rate limiting
  rule, IP-based fixed-window. That is a *partial* mitigation of ADR-0004's outstanding gap
  — it bounds a crude flood from a single source — and explicitly **not** the per-token
  limiting ADR-0004 specifies. This ADR opens the door; it does not close that gap.
- Shorter and less silly to text to someone.

**Bad, and we accept it knowingly:**

- **This adds a dependency that can lapse.** A domain registration is a recurring cost with
  an annual renewal, and the nameservers must stay on Cloudflare. That is a direct tension
  with [principle 6](../PRINCIPLES.md) — *zero recurring cost, zero expiring credentials* —
  and it is structurally the same shape as the iCloud storage whose lapse started this whole
  project. It is the real price of this decision and should not be glossed over.

  Three things make it acceptable rather than reckless:

  1. **The failure is loud, not quiet.** An expired domain means the app does not load at
     all. [Principle 2](../PRINCIPLES.md)'s actual enemy is a list that looks current and
     isn't; an unreachable site is not that, and it gets noticed and fixed.
  2. **Auto-renew** on the registration.
  3. **The workers.dev hostname remains live.** If the domain lapses, the app is still
     there at `grocery-list.groc-list.workers.dev` — recovery is re-sharing a link, not
     rebuilding anything or losing data. The lists live in D1, which none of this touches.

- **Two hostnames now serve the same app.** Mildly confusing; mitigated by only ever handing
  out one of them, and by the fallback being worth more than the tidiness.
- **The URL carries a personal name.** Immaterial for a grocery list shared between spouses,
  but worth noting: anyone who sees the link learns whose it is.
- **A Cloudflare zone is now load-bearing**, not just a Cloudflare account.

## Alternatives considered

### Stay on workers.dev and change nothing

Free, nothing new to lapse, no work at all — and it keeps
[principle 6](../PRINCIPLES.md) perfectly clean, which is a genuine argument.

Rejected because "change nothing" is not actually the neutral option it looks like. The
hostname gets frozen into an icon at first install, so doing nothing selects the permanent
URL by default. If we are ever going to want a custom domain, this is the only moment it is
free. It also leaves the WAF route permanently closed, which matters given ADR-0004's
outstanding gap.

### Rename the Worker to shorten the URL

`groceries.groc-list.workers.dev`. One line in `wrangler.toml`, no new dependency, and it
keeps principle 6 intact.

Rejected because it solves only the aesthetics. The hostname is still assembled from parts
Cloudflare controls, still moves if the account subdomain ever changes, and still offers no
zone-level WAF. It buys the smallest benefit of the three options while spending the same
one-time window.

### Rename the account's workers.dev subdomain

Would remove the redundant half of `grocery-list.groc-list.workers.dev` without any new
dependency.

Rejected on reliability: it is account-wide, and the self-serve path is unreliable once a
subdomain is registered — the API refuses with error 10036 and there is a steady stream of
people asking Cloudflare support to change it by hand. Spending an unknown amount of Lauren's
time on a support ticket, for a purely cosmetic gain, is a bad trade.

### Use the apex, `laurenchaplinski.com`

Rejected outright: it would route the entire personal domain to this Worker, so anyone
visiting the personal site would get a grocery list.
