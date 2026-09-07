# Architecture Decision Records

An ADR captures one significant decision: the situation that forced it, what we chose,
and what we now have to live with as a result.

## How we use them

- **Write the ADR before the code.** The ADR gets reviewed and accepted first; the feature
  PR that implements it references it by number.
- **One decision per record.** If it needs two decisions, it needs two records.
- **Numbered sequentially**, four digits, never reused.
- **Immutable once accepted.** We don't edit history. If we change our minds, we write a
  new ADR that supersedes the old one, and mark the old one `Superseded by ADR-00XX`.
- **Argue against [the principles](../PRINCIPLES.md).** An ADR that can't point at a
  principle it serves is probably a preference, not a decision.
- **Record the alternatives we rejected.** The rejected options are usually the most
  valuable part of the document a year later.

## Statuses

| Status | Meaning |
|---|---|
| `Proposed` | Written, awaiting review |
| `Accepted` | Agreed; implement it |
| `Superseded by ADR-00XX` | Replaced by a later decision |
| `Deferred` | Deliberately not deciding yet, with a note on what would force the decision |

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-pwa-instead-of-native-ios-app.md) | A home-screen PWA instead of a native iOS app | Accepted |
| [0003](0003-cloudflare-workers-and-d1.md) | Cloudflare Workers and D1 as the backend | Accepted |
| [0004](0004-secret-household-link-authentication.md) | Authenticate with a secret household link | Accepted |
| [0005](0005-offline-first-sync-protocol.md) | Offline-first sync protocol | Accepted |
| [0006](0006-serve-from-a-custom-domain.md) | Serve the app from a custom domain | Accepted |

Planned, not yet written:

| # | Title | Status |
|---|---|---|
| 0007 | Siri support via Apple Shortcuts | Not yet written |
| 0008 | Automatic item categorization | Not yet written |

> **Why 0008 comes before 0007 in the plan.** Categorization was pencilled in as 0006 and
> Siri as 0007. When the custom-domain decision took 0006, the obvious move was to shift
> both — except ADR-0002 is accepted, and it names "the planned ADR-0007" for Siri in its
> body. Editing that to renumber it would be editing an accepted record, which is the one
> thing this process does not do. So Siri keeps 0007, and categorization moved to 0008
> instead. Numbers are cheap; the immutability rule is the point.

## Template

Copy [`0000-template.md`](0000-template.md).
