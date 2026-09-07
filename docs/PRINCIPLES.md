# Principles

These are the values every decision in this repo gets argued against. When an ADR proposes
something, it should be possible to point at the principle it serves — and when two
principles collide, the lower-numbered one wins.

They exist because this app is replacing something that worked *until it didn't*. iOS
Reminders was fine for years, and then one full iCloud account turned it into a list that
was quietly wrong. Quietly wrong is the failure mode we are designing against.

---

## 1. Sync reliability outranks every other feature

An item entered on one phone is an item that appears on the other phone. Not usually.
Not when the network is good. Always, eventually, and without anyone having to think
about it.

Any feature that puts this at risk does not ship. If we ever have to choose between a
delightful feature and a boring guarantee, we choose the guarantee.

## 2. Never lie about state

The app must never display a list it isn't confident is current without saying so. A
visible sync status is not a nicety, it is the core safety feature: the failure that
sent us here was an app that looked fine and wasn't.

"Synced just now." "Syncing…" "Offline — 2 changes waiting." Always on screen. Always true.

## 3. Two taps to add an item

Open the icon, type, done. Setup is one tap of a link plus "Add to Home Screen," once,
forever — no account, no password, no code to remember, nothing that expires and has to
be redone.

The person using this app is allowed to have zero interest in apps. If a feature requires
explaining, it is the feature that is wrong.

## 4. Offline is normal, not an error

Grocery stores have bad signal. Every action works instantly offline and syncs later.
"No connection" is a state we operate in, not an error we display.

## 5. Boring technology

Nothing in here should be un-debuggable cold six months from now. Prefer the approach
with fewer moving parts, even when it is less elegant. Polling beats websockets if
polling cannot silently die. A dictionary beats a model if a dictionary is good enough.

We are two people and a grocery list, not a startup.

## 6. Zero recurring cost, zero expiring credentials, zero scheduled maintenance

Free tiers only. No subscriptions, no certificates to renew, no builds that expire and
force a reinstall. A thing that requires periodic attention is a thing that will
eventually be neglected and break — which returns us to a list that is quietly wrong.

## 7. Our data is portable

It's our grocery list. One tap exports the whole thing as plain text. No lock-in,
no proprietary format, no vendor who can strand us.

## 8. Small PRs, one ADR per real decision

Significant decisions get written down before they get built, with the alternatives we
rejected and why. Every feature PR names the ADR it implements. Future-us gets to know
what past-us was thinking.
