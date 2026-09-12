# Operations

Everything needed to deploy, run, and look after this. Written for whoever has to do it in
eighteen months, having forgotten all of it.

---

## What you need

- **Node 22 or newer.** The API test suite uses Node's built-in `node:sqlite`, which
  arrived in Node 22.
- A free Cloudflare account. Everything here stays inside its free tier.

## First deploy

```bash
npm install
npx wrangler login

# Create the tables.
npm run migrate:remote -w @grocery/api

# Build the PWA and publish it together with the Worker.
npm run deploy
```

> The `database_id` in `apps/api/wrangler.toml` is already set and committed. You only need
> `npx wrangler d1 create grocery-list` — and to paste the new id in — if you are standing
> this up under a *different* Cloudflare account.

`wrangler deploy` prints the workers.dev URL —
`https://grocery-list.groc-list.workers.dev`.

## Connecting the custom domain

The address we actually hand out is **<https://groceries.laurenchaplinski.com>**
(ADR-0006). This is a one-time step in the Cloudflare dashboard, not something `wrangler`
does:

1. Open the `grocery-list` Worker → **Settings** → **Domains & Routes** → **Add** →
   **Custom Domain**.
2. Enter the full hostname: `groceries.laurenchaplinski.com`. Not just `groceries` — the
   field takes a complete hostname.
3. Cloudflare creates the proxied DNS record and provisions the TLS certificate itself.
   Do not pre-create a CNAME by hand; a Custom Domain cannot be added on a hostname that
   already has one.

Then open <https://groceries.laurenchaplinski.com>, tap **Create our list**, and you have
your household link.

> **Do not enter the bare apex** (`laurenchaplinski.com`). That would route the entire
> personal domain to this Worker.

**The workers.dev URL stays enabled on purpose.** It is the fallback if the domain ever
lapses or its nameservers move: the app is still reachable at
`grocery-list.groc-list.workers.dev`, and recovery is re-sharing a link rather than
rebuilding anything — the lists live in D1, which none of this touches. Hand out only the
custom domain; keep the other in your back pocket.

> **The host is part of every home screen icon.** Changing the address later means a new
> icon for both of you and re-sharing the link. The household token itself survives, since
> it lives in D1, but the old bookmark stops working. ADR-0006 is why this got settled
> before anyone installed anything.

## Deploying a change

**Merging to `main` deploys automatically** (ADR-0009). A GitHub Actions job builds and
publishes the Worker the same way `npm run deploy` always has — API and front end together,
one origin (ADR-0003) — right after checking the remote D1 for a migration the code expects
that isn't there yet. Nobody has to reinstall anything; the service worker picks up the new
version the next time the app is opened.

> **If that check finds a pending migration, the job fails on purpose** instead of shipping
> a Worker against a schema it doesn't have. Apply the migration, then re-run the failed
> job from the repo's Actions tab (or push an empty commit) to deploy:
>
> ```bash
> npm run migrate:remote -w @grocery/api
> ```
>
> Check `apps/api/migrations/` against what production has if you're unsure what's pending;
> `npm run migrate:check` runs the same check the deploy job does, from your own machine.

> **A merge that lands while a deploy is already running queues behind it** rather than
> canceling it — deliberately; see ADR-0009 if the reasoning matters to you later.

> **If a change seems not to have landed,** check the Actions tab first — the job may have
> failed at either step above. A stale service worker is the next thing to suspect: it can
> keep serving the previous build. Opening the app in a private Safari tab bypasses it and
> shows what actually deployed.

> **To roll back a bad deploy**, Cloudflare keeps prior Worker versions —
> `npx wrangler rollback` walks you through picking one and returns to it in about as long
> as a deploy takes. The lists themselves live in D1 and aren't touched by rolling back the
> Worker.

**One-time setup, already done for this repo:** the deploy job authenticates as
`CLOUDFLARE_API_TOKEN`, a repository secret under **Settings → Secrets and variables →
Actions**. If it's ever missing or revoked, the deploy job fails loudly rather than
deploying with no credentials — create a new API token scoped to Workers and D1 edit
permissions on this account and add it under that same name.

Deploying by hand still works, for local testing or if CI itself is unavailable. It has the
same migration hazard `npm run migrate:check` guards against in CI, so run that first if
you're unsure:

```bash
npm run migrate:check && npm run deploy
```

## Running it locally

Two terminals:

```bash
npm run migrate:local -w @grocery/api   # once, to create the local tables
npm run dev:api                         # Worker + local D1 on :8787
npm run dev:web                         # Vite with hot reload on :5173, proxying /api
```

Open <http://localhost:5173>. The local database is a real SQLite file under
`apps/api/.wrangler/` and is gitignored.

To exercise the production path instead — the built PWA served by the Worker itself, service
worker and all:

```bash
npm run preview     # builds, then serves everything from :8787
```

## Checks

```bash
npm run check:docs  # links, ADR index, drift-prone facts, American English
npm run typecheck   # src and tests, all three tsconfigs
npm test            # the full suite
npm run build
```

CI runs all four on every pull request.

## Database

```bash
# What's actually in there
npx wrangler d1 execute grocery-list --remote \
  --command "select name, checked, deleted_at, revision from items order by revision desc limit 20"

# Apply a new migration (add the .sql file to apps/api/migrations/ first)
npm run migrate:remote -w @grocery/api
```

## Backups

The dataset is tiny and the stakes are low, but a dump costs nothing:

```bash
npx wrangler d1 export grocery-list --remote --output backup-$(date +%F).sql
```

Worth doing before any migration that changes existing data.

## Rotating a household link

There's no "sign out other devices" — ADR-0004 explains why that trade was made. If a link
ever needs replacing:

1. Open the app's root URL and create a new household.
2. Copy the items across by hand (there aren't many).
3. Delete the old household's rows from D1:
   ```bash
   npx wrangler d1 execute grocery-list --remote \
     --command "delete from items where household_id = '<old-id>'; delete from households where id = '<old-id>'"
   ```
4. Send everyone the new link; each person re-adds it to their home screen.

Rare enough that a manual procedure is the right amount of engineering.

## Deleting an abandoned list

Every household ever created still works. A list you made once while testing, or before
getting the setup right, sits there indefinitely — reachable, functional, and empty.

That is worth cleaning up, and not for tidiness. If a stale link is still sitting in a text
message and someone taps it instead of the current one, both phones say *"Synced just now"*
while showing different lists. A list that looks right and isn't is the exact failure this
app exists to prevent ([principle 1](PRINCIPLES.md)). The rows cost nothing; the ambiguity
does.

**1. Work out which one to keep.** The database stores a hash of each token, not the token,
so you cannot match your link against it directly. Listing households with their item counts
is usually enough — yours is the one with groceries in it:

```bash
npx wrangler d1 execute grocery-list --remote --command \
  "select h.id, h.created_at, h.revision, count(i.id) as items
   from households h
   left join items i on i.household_id = h.id and i.deleted_at is null
   group by h.id order by h.created_at"
```

If that is ambiguous — several lists with items, say — add a uniquely named item to the real
list from your phone, then find which household it landed in. No hashing required:

```bash
npx wrangler d1 execute grocery-list --remote --command \
  "select household_id from items where name = 'keepthisone'"
```

**2. Take a backup.** Cheap, and this is the one operation here that destroys data:

```bash
npx wrangler d1 export grocery-list --remote --output backup-$(date +%F).sql
```

**3. Delete.** Items first — `items.household_id` references `households(id)`:

```bash
npx wrangler d1 execute grocery-list --remote --command \
  "delete from items where household_id in ('<id1>','<id2>');
   delete from households where id in ('<id1>','<id2>')"
```

**One consequence to know.** A phone still holding a deleted household's link gets a `404`
and will sit showing *"Offline"* indefinitely. It is telling the user something is wrong,
which is the important half — but it is the wrong reason, and that grates against
[principle 2](PRINCIPLES.md). Noted in [ROADMAP.md](ROADMAP.md); it only matters if a
deleted link is still in someone's hands.

## Cost

Everything is inside Cloudflare's free tier by orders of magnitude — roughly 2,000 requests
a day against a six-figure allowance, and a database measured in kilobytes. No billing is
configured, so nothing can silently start charging.

## Health check

The honest one is the app itself: open it on both phones, add an item on one, watch it
appear on the other. The status line at the top of the screen is the real monitoring
(ADR-0005, [principle 2](PRINCIPLES.md)) — when something is wrong, the app says so on the
device where it matters.
