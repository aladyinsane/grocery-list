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

# Create the database, then paste the id it prints into apps/api/wrangler.toml
# (replacing REPLACE_WITH_YOUR_DATABASE_ID).
npx wrangler d1 create grocery-list

# Create the tables.
npm run migrate:remote -w @grocery/api

# Build the PWA and publish it together with the Worker.
npm run deploy
```

`wrangler deploy` prints the URL. With the `groc-list` workers.dev subdomain and the
Worker named `grocery-list` in `wrangler.toml`, that is
<https://grocery-list.groc-list.workers.dev> — the address
[SETUP.md](SETUP.md) hands out. Open it, tap **Create our list**, and you have your
household link.

> **The host is part of every home screen icon.** Renaming the Worker later changes the
> URL, which means a new icon for everyone and re-sharing the link — the household token
> itself survives, since it lives in D1, but the old bookmark stops working. Cheapest to
> settle the name before the first deploy.

## Deploying a change

```bash
npm run deploy
```

Builds the PWA and publishes the Worker — API and front end together, one origin
(ADR-0003). Nobody has to reinstall anything; the service worker picks up the new version
the next time the app is opened.

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
npm run typecheck   # src and tests, all three tsconfigs
npm test            # 54 tests
npm run build
```

CI runs all three on every pull request.

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

## Cost

Everything is inside Cloudflare's free tier by orders of magnitude — roughly 2,000 requests
a day against a six-figure allowance, and a database measured in kilobytes. No billing is
configured, so nothing can silently start charging.

## Health check

The honest one is the app itself: open it on both phones, add an item on one, watch it
appear on the other. The status line at the top of the screen is the real monitoring
(ADR-0005, [principle 2](PRINCIPLES.md)) — when something is wrong, the app says so on the
device where it matters.
