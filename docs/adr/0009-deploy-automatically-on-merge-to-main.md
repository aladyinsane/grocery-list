# ADR-0009: Deploy automatically on merge to main

**Status:** Accepted
**Date:** 2026-09-10

## Context

Today, shipping a change is `npm run deploy`, run by hand, by whoever remembers to run it.
That command alone is not the whole procedure — the actual sequence, followed correctly by
luck as much as diligence, is:

1. Fast-forward `main` without clobbering anything uncommitted.
2. Check `apps/api/migrations/` against what's already applied to the remote D1, because
   `npm run deploy` does not run migrations itself — a Worker built against a column that
   doesn't exist yet is a live outage, not a build error (`docs/OPERATIONS.md` already warns
   about this).
3. `npm install`, and discard the `package-lock.json` churn that reappears most times
   (`esbuild`'s optional-dependency `peer` flags flapping between npm versions) without
   discarding anything real.
4. Build and deploy.
5. Fetch the live URL and an API route to confirm the Worker is actually serving the new
   version, not just that `wrangler` exited zero.

Nothing enforces that this happens the same way twice, or that it happens at all in any
particular window after a PR merges. A merged PR and a deployed PR are two different facts
right now, and the gap between them is exactly the kind of thing [principle 1](../PRINCIPLES.md)
— sync reliability outranks everything — should not tolerate: the app people rely on can sit
behind what's actually been reviewed and merged, silently, for however long nobody happens to
run the command. It's also inconsistent with the user's own CLAUDE.md preference for
correctness enforced by the system rather than relying on someone remembering to check by
hand.

One step above is genuinely dangerous rather than merely tedious: applying a pending
migration. Migrations mutate the live schema and, unlike a code deploy, don't have a
one-command rollback. That's why today's deploys were run under an explicit instruction to
stop and ask rather than auto-apply a pending migration — a deliberate human checkpoint on
the one action in this pipeline that isn't cheaply reversible.

A third risk is specific to letting CI trigger deploys instead of a person choosing the
moment: two merges landing close together can start two overlapping runs of whatever job
ends up deploying, and GitHub Actions does nothing about that by default.
`.github/workflows/ci.yml` already carries a `concurrency` block — `group:
ci-${{ github.ref }}`, `cancel-in-progress: true` — and for a push to `main`, `github.ref`
resolves to `refs/heads/main` every time, so every merge to `main` lands in the same group
as the one before it. The sibling `portfolio` project added that exact shape of block —
cancel-in-progress, keyed on the ref — purely to save minutes on redundant CI runs, and
within twelve hours it had canceled three runs at the moment of a PR merge, twice killing
the production deploy itself mid-flight. Each cancellation surfaced as a red X with no
error message and zero steps executed — it read exactly like a flaky failure, and got
"fixed" with a re-run that changed nothing about the setup that caused it. Whichever job
deploys `grocery-list` is going into this same workflow file, so it inherits that block's
behavior unless something is done about it on purpose.

## Decision

We will deploy automatically from CI on every push to `main`, as a job appended to
`.github/workflows/ci.yml` that runs after — and depends on — the existing `check` job
(docs, typecheck, test, build). A merge to `main` only reaches production if it already
passed everything CI checks today.

The new job will:

1. Run `wrangler d1 migrations list grocery-list --remote` and parse whether anything is
   pending.
2. **If a migration is pending, the job fails without deploying.** It prints the same
   guidance `docs/OPERATIONS.md` gives a human today: apply the migration with
   `npm run migrate:remote -w @grocery/api`, then re-run the workflow (`workflow_dispatch`
   or an empty commit) to deploy.
3. **If nothing is pending, it runs `npm run deploy`** — the same build-and-publish command
   used today, unchanged.

Applying migrations is explicitly **not** automated by this ADR. That stays a manual,
deliberate step — someone runs it, watches it, and can back out beforehand with
`wrangler d1 export`, exactly as `docs/OPERATIONS.md` already describes. This ADR only
removes the *routine* manual step (plain code deploys, which are the overwhelming majority
of merges) and keeps the *risky* one (schema changes) exactly as deliberate as it is now.

The deploy job carries its own `concurrency` block, distinct from the one already governing
`check`:

```
concurrency:
  group: production-deploy
  cancel-in-progress: false
```

**Fixed group name** — nothing derived from `github.ref` or any other event data — so every
push to `main` contends for the same slot no matter which branch or PR it came from.
**`cancel-in-progress: false`**, the opposite of `check`'s setting: a deploy already running
is never interrupted. A merge landing while one is in flight queues behind it instead; if a
second merge lands before that queued run even starts, GitHub keeps only the newest queued
run and drops the older one, so nothing backs up indefinitely and whatever eventually runs
always deploys the latest commit on `main`. `check`'s existing workflow-level block can't
simply stay as it is once this job joins the same file — appended as-is, the deploy job
would inherit `cancel-in-progress: true` keyed on a ref that's identical for every push to
`main`, which is precisely the shape that caused the `portfolio` incident above. The
implementation PR needs to move `check`'s concurrency into its own job-level block so
`deploy` isn't governed by it.

Queuing costs a few idle minutes on a job that's already cheap. Canceling mid-flight is a
different category of problem here: this app has a D1 database behind it, and this ADR
already commits to failing the job closed rather than deploying against an unmigrated
schema. A deploy killed partway through, possibly mid-migration-check, is exactly the kind
of case worth designing out of existence rather than reasoning about individually later.

CI needs a new `CLOUDFLARE_API_TOKEN` repository secret, scoped to Workers and D1 edit
permissions on this one account, to run `wrangler` non-interactively.

`docs/OPERATIONS.md` gets updated alongside the implementation PR: "Deploying a change"
changes from an instruction to run `npm run deploy` yourself to a description of what
happens automatically, with the migration-pending failure mode documented as what to do
when CI stops on it.

## Consequences

**Good:**

- **Merged and deployed become the same fact for ordinary changes.** No more gap where
  main is ahead of production because nobody ran the command — which is the actual failure
  mode this ADR exists to close, per principle 1.
- **The migration check becomes a machine check that runs every single time**, not a step
  a human (or an agent working from a task description) has to remember. Today's deploy
  only checked it because the instructions happened to say so explicitly.
- **PR review becomes the real approval gate**, which it already was in spirit — a change
  isn't "done" until it's live, and now merging *means* that instead of implying it.
- Removes the lockfile-churn judgment call from the routine path entirely: CI installs with
  `npm ci`, which fails on a lockfile mismatch instead of silently regenerating one.

**Bad, and we accept it knowingly:**

- **There is no staging environment** (principle 5 — we are two people and a grocery list,
  not a startup) — so for any change without a migration, merging *is* shipping, immediately,
  with no pause to double-check the live app by hand. The mitigation is what already exists:
  PR review happens before merge, not after, and Cloudflare keeps prior Worker versions —
  `wrangler rollback` returns to the last good version in about as long as this whole deploy
  takes. That should be written down in `docs/OPERATIONS.md` as part of the implementation,
  since it's the actual answer to "a bad merge just went live, now what."
- **A new secret enters the pipeline**: `CLOUDFLARE_API_TOKEN` in GitHub Actions. It's a
  standing credential now, not something typed in at deploy time — some tension with
  principle 6 (zero expiring credentials), though the token itself doesn't expire unless
  rotated. If it's ever revoked, deploys fail loudly (CI goes red) rather than quietly, which
  is the acceptable failure direction per principle 2.
- **A PR with a migration no longer deploys on merge.** CI fails that job on purpose, so
  "merged" temporarily stops meaning "live" for exactly the changes where that gap matters
  least to close quickly and most to get right. Someone has to notice the red check, run the
  migration by hand, and re-trigger. That's a manual step surviving on purpose — see Decision
  — but it means this ADR does not fully deliver "merge and forget" for every kind of change,
  only most of them.
- **A flaky Cloudflare API call now blocks shipping** where it previously would have just
  meant retrying a local command. Mitigated by the job being independently re-runnable from
  the Actions tab without needing a new commit.

## Alternatives considered

### Keep deploying by hand

Zero new infrastructure, zero new secrets, and it's what today's deploy actually did,
successfully. Rejected because that success depended on the instructions for this specific
deploy spelling out every step, including the migration check, in order. Nothing about
`npm run deploy` itself enforces any of that — a plain `npm run deploy` after a merge with a
pending migration would have shipped a broken app, silently, which is the exact "quietly
wrong" failure mode this whole project exists to escape.

### Auto-apply migrations too, so every merge fully ships unattended

The more complete version of "merge and forget" — no PR would ever leave main un-deployed.
Rejected because it collapses the one deliberate checkpoint that remains in this pipeline
into the same automatic trigger as routine code changes. Migrations aren't cheaply
reversible the way a Worker deploy is; today's task was explicitly told to stop and ask
before applying one rather than assume deploy authorization extended that far, and that
distinction is worth keeping permanent rather than convenient.

### A manually-triggered GitHub Actions workflow (`workflow_dispatch`), instead of on-push

Would move the deploy off a laptop and into a consistent, scripted environment without
tying it to merge timing. Rejected because it doesn't fix the actual problem: the failure
mode today isn't that deploying is hard to invoke, it's that it's easy to forget or run out
of order. A button that still has to be remembered is not meaningfully different from a
command that has to be remembered.

### `cancel-in-progress: true` for the deploy job too

Would skip a redundant deploy outright when two merges land back to back, rather than
letting the second one sit queued for a few minutes — a real, if small, efficiency gain,
and consistent with what `check` already does. Rejected on the evidence in Context: that's
the exact configuration that canceled the `portfolio` production deploy twice in half a
day, silently, with a failure that looked like flakiness rather than what it was. A few
minutes of queued CI time is cheap; diagnosing a canceled deploy that happened to land
mid-migration is not.
