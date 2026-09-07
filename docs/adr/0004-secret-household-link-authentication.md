# ADR-0004: Authenticate with a secret household link

**Status:** Accepted
**Date:** 2026-09-07

## Context

Two people need to reach the same list from two phones, and the server needs some way to
know which list to serve. That is an authentication problem, but it's an unusually
forgiving one:

- There are exactly two users, who live together and trust each other completely.
- The data is a grocery list. The worst realistic outcome of a leak is that a stranger
  learns we're low on oat milk. There is nothing to steal, no money to move, and no
  personal information beyond food preferences.
- One of the two users is not tech savvy. [Principle 3](../PRINCIPLES.md) says setup is a
  link and one tap, and that every login screen is a thing that can go wrong at the worst
  moment.

The threat model that actually matters isn't an attacker. It's **friction**: a forgotten
password, an expired session, a magic-link email that lands in spam, a login prompt that
appears while standing in a checkout queue. Each of those is a way the list becomes
unavailable, which is the failure we're here to prevent.

We are choosing how much security to trade for how much reliability, and for this data the
answer is "quite a lot."

## Decision

We will identify a household by a **secret token embedded in the URL**.

- Creating a list generates a **128 bits of cryptographic randomness**, encoded as a
  URL-safe string of roughly 26 characters. This is the household token.
- The list lives at `https://<host>/h/<token>`. That URL is the credential. Anyone holding
  it can read and edit the list; anyone without it cannot guess it.
- The web app reads the token from the URL on first load, stores it in `localStorage`, and
  sends it as `Authorization: Bearer <token>` on every API request.
- The server stores only the **SHA-256 hash** of the token. The plaintext is returned
  exactly once, at creation time, and never persisted server-side.
- An unrecognised token returns `404`, never `401` or `403` — the server never confirms
  that a household exists.
- Requests are rate-limited per token to blunt brute-force attempts and to bound abuse if
  a link ever does leak.

Sharing is: text your partner the link. They tap it, add it to their home screen, and are
permanently signed in.

Revocation is: create a new household and move the items over. Documented in
`docs/OPERATIONS.md`.

## Consequences

**Good:**

- **There is no login.** Nothing to remember, nothing to type, nothing to reset, no email
  round-trip, no session that expires at an inconvenient moment. The single largest source
  of "the app isn't working" is deleted rather than mitigated.
- **Setup for the non-technical user is one tap of a link, then Add to Home Screen.** The
  home screen bookmark stores the full URL, so the credential is carried by the icon
  itself.
- **No user table, no password hashing, no session management, no email provider.** Less
  code, fewer dependencies, fewer failure modes ([principle 5](../PRINCIPLES.md)).
- **128 bits is not brute-forceable.** The search space is far beyond what rate-limited
  guessing could touch in the lifetime of the universe.
- Hashing server-side means a database dump does not hand over working credentials.

**Bad, and we accept it:**

- **The URL is the credential, and URLs leak in ways passwords don't.** Anyone who sees the
  phone screen, the text message, or a screenshot has full access. We consider this
  acceptable for a grocery list shared between spouses; we would not consider it acceptable
  for anything else, and this ADR should be cited as the reason not to put anything else in
  this app.
- **No per-user identity.** We cannot show who added an item or who checked one off. For
  two people who talk to each other this is close to worthless anyway, but it does foreclose
  features like "notify me when *you* add something." If we ever want that, it's a new ADR.
- **Revocation is heavyweight.** There's no "sign out other devices" — a compromised link
  means creating a new household and migrating. Rare enough that a documented manual
  procedure is the right amount of engineering.
- **Anyone with the link is a full editor.** No read-only sharing, no guest access.
- **Browser storage can be evicted.** If Safari clears `localStorage` after long non-use,
  the app falls back to reading the token from the URL — which is why the home-screen icon
  keeps the token in its URL rather than relying on storage alone.

**Security measures this decision does *not* excuse us from:**

- Constant-time comparison of token hashes.
- `Referrer-Policy: no-referrer`, so the token is never leaked in a `Referer` header to any
  third party.
- No third-party scripts, analytics, or fonts on the page — nothing that could observe the
  URL.
- The token must never appear in server logs.

## Alternatives considered

### Email magic links

The conventional friction-light auth. Rejected because it isn't actually friction-light on
a phone: it's app-switch to Mail, wait for delivery, hope it isn't in spam, tap, switch
back. And it *expires*, so the flow recurs. For a user who is not tech savvy, an
authentication step that reappears unpredictably is exactly the wrong shape. It also adds
an email provider — a third-party dependency that can fail, get rate-limited, or start
charging.

### Short household code plus a name ("CHAPLINSKI", then pick who you are)

Genuinely appealing: the link becomes safe to share, and we'd get per-user attribution.
Rejected because a short code is guessable and would need real rate limiting to be
meaningful, while a long code is just our token with extra typing. It also adds a setup
screen — one more place for a non-technical user to get stuck — in exchange for
attribution we established above is close to worthless for two people. Reconsider if a
third person ever joins.

### Username and password

Maximum friction, a password to forget and reset, a reset flow to build, credentials to
store safely. All of that cost to protect a list of vegetables.

### Sign in with Apple

Both users have Apple IDs, so it's plausible, and it gives real per-user identity.
Rejected because it means an Apple Developer account (see ADR-0002 — we specifically
avoided that recurring cost), an OAuth flow in a PWA, and a login step. The dependency
we'd be adding is *the same kind of dependency* — an Apple account service — whose failure
brought us here.

### No authentication at all, one hardcoded list

Simplest imaginable. Rejected because it means anyone who finds the URL can edit our
groceries, and there is no path to a second household if a friend wants one. The token
costs us nothing over this.
