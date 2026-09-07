# ADR-0002: A home-screen PWA instead of a native iOS app

**Status:** Accepted
**Date:** 2026-09-07

## Context

Two users, both on iPhone, replacing a shared iOS Reminders list. The obvious instinct is
"we both have iPhones, so build an iPhone app." The obvious instinct is wrong here, and
it's worth writing down why.

The constraints that actually matter:

- One of the two users is not tech savvy and has no interest in becoming so. Setup has to
  be a link and one tap ([principle 3](../PRINCIPLES.md)).
- The whole reason we're building this is that the previous solution required a piece of
  ongoing maintenance (iCloud storage) that lapsed, and the list quietly stopped syncing.
  We must not introduce a *new* thing that lapses ([principle 6](../PRINCIPLES.md)).
- Nice-to-have: Siri, because "hey Siri, add milk to the grocery list" is genuinely how
  this list gets used one-handed in a kitchen.

Distributing a native iOS app to two people means one of:

- **The App Store.** A $99/year Apple Developer membership, app review, and a public
  listing for a two-person grocery list. Absurd for the use case, and it's a recurring
  bill and an annual renewal that can lapse.
- **TestFlight.** Same $99/year membership, and TestFlight builds **expire after 90 days**.
  Every quarter, the app stops working and both people have to reinstall it. That is
  precisely the failure mode we are running away from, on a timer.
- **Sideloading / AltStore.** Free developer certificates expire after 7 days. Worse.

All three require a Mac with Xcode to produce a build at all, which makes "fix a small
bug" a much heavier operation than it should be.

## Decision

We will build a Progressive Web App: a web app served over HTTPS with a web app manifest
and a service worker, installed to the iPhone home screen via Safari's **Add to Home
Screen**.

Once added, it gets its own icon, launches full-screen with no Safari chrome, and is
indistinguishable from a native app in normal use. There is nothing to reinstall, nothing
to renew, and no build step between "push a fix" and "the fix is on both phones."

Siri support is handled separately, via an Apple Shortcut that posts to our API — see the
planned ADR-0007. `POST /api/quick-add` is reserved for it from the start.

## Consequences

**Good:**

- Setup is: tap a link, tap Share, tap Add to Home Screen. Once, forever. No account, no
  App Store, no Apple ID password prompt.
- Deployment is a `git push`. A bug fixed in the morning is on both phones at lunch, with
  no user action at all.
- $0/year, no renewals, no expiry, nothing to neglect.
- Cross-platform for free, if either of us ever switches to Android.
- We can develop and test the whole thing on Linux. No Mac required.

**Bad, and we accept it:**

- **No native Siri integration.** We get Siri via an Apple Shortcut, which means the
  invocation is "Hey Siri, Grocery" (the shortcut's name) rather than the fully natural
  "add milk to my grocery list." This is a real regression from Reminders and the main
  thing we're giving up.
- **No home-screen widget.** iOS does not offer widgets to web apps.
- **No push notifications worth relying on.** iOS supports web push for installed PWAs
  from 16.4, but only for home-screen-installed apps and with a permission prompt. We
  treat it as unavailable and design around it; nothing in the app depends on a push.
- **Safari-only engine, and Apple controls the rules.** Storage can be evicted after
  extended non-use, and PWA capabilities on iOS have historically moved unpredictably.
  Mitigated by the server being the source of truth: worst case, the app re-downloads the
  list. Nothing lives only on the phone.
- **Add to Home Screen is a discoverability cliff.** Safari does not prompt for it, and a
  user who doesn't do it gets a worse experience in a browser tab. Mitigated by an
  explicit, illustrated in-app banner on first visit and a permanent "?" help screen.

## Alternatives considered

### Native iOS app via TestFlight

The 90-day build expiry is disqualifying on its own. A shared list that stops working
every quarter until someone remembers to upload a new build, and then both users have to
reinstall, is a worse version of the problem we're solving. The $99/year and Mac
requirement compound it.

### Native iOS app on the App Store

Same cost and Mac requirement, plus app review, plus publishing a listing for a household
grocery list. Buys us true Siri App Intents and widgets, which are nice but not worth a
recurring bill and a release process for two users.

### Keep using iOS Reminders, and fix the iCloud storage

The cheapest option, and worth naming. Rejected because it means paying Apple monthly
forever for a problem that recurs the moment storage fills again, and because it leaves
the reliability of our grocery list dependent on the state of an unrelated photo library.
We want a list whose sync depends on nothing but itself.

### A plain website, no PWA

Simpler — no service worker, no manifest. Rejected because it means no home-screen icon,
no offline access, and browser chrome around the app. Offline is
[principle 4](../PRINCIPLES.md); a grocery app that doesn't work in a grocery store with
bad signal is not fit for purpose.

### Hybrid wrapper (Capacitor / React Native shell)

Inherits every distribution problem of the native option while adding a build toolchain.
Worst of both.
