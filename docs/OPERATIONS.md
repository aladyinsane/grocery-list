# Operations

Everything needed to deploy, back up, and look after this. Written for whoever has to do it
in eighteen months, having forgotten all of it.

> Commands referencing `apps/api` and `wrangler` become real in PR 2, which adds the Worker.

---

## One-time setup

1. A free Cloudflare account.
2. `npm install` at the repo root (npm workspaces installs everything).
3. `npx wrangler login`.
4. Create the D1 database and paste the returned `database_id` into `apps/api/wrangler.toml`:
   ```
   npx wrangler d1 create grocery-list
   ```
5. Apply migrations to production:
   ```
   npx wrangler d1 migrations apply grocery-list --remote
   ```

## Deploying

```
npm run deploy
```

Builds the web app and publishes the Worker — API and front end together, one origin
(ADR-0003). No user action is needed on either phone; the next time the app is opened it
picks up the new version.

## Local development

```
npm run dev
```

Runs the Worker and the web app against a **local** D1 database with the same SQLite engine
as production. Local data lives in `.wrangler/` and is gitignored.

## Database

Look at what's in there:

```
npx wrangler d1 execute grocery-list --remote --command "select * from items order by revision desc limit 20"
```

Apply a new migration (add the `.sql` file to `apps/api/migrations/` first):

```
npx wrangler d1 migrations apply grocery-list --remote
```

## Backups

The dataset is tiny and the stakes are low, but a periodic dump costs nothing:

```
npx wrangler d1 export grocery-list --remote --output backup-$(date +%F).sql
```

Worth doing before any migration that changes existing data.

## Rotating a household link

There's no "sign out other devices" — ADR-0004 explains why that trade was made. If a link
ever needs replacing:

1. Create a new household in the app.
2. Copy the items across (export from the old list, paste into the new one).
3. Delete the old household row from D1.
4. Send everyone the new link; each person re-adds it to their home screen.

Rare enough that a manual procedure is the right amount of engineering.

## Cost

Everything is inside Cloudflare's free tier and expected to stay there by orders of
magnitude — roughly 2,000 requests a day against a six-figure allowance, and a database
measured in kilobytes. There is no billing configured, so there is nothing that can
silently start charging.

## Health check

The honest one is the app itself: open it on both phones, add an item on one, watch it
appear on the other. The status line at the top of the screen is the real monitoring
(ADR-0005, [principle 2](PRINCIPLES.md)) — if something is wrong, the app says so on the
device where it matters.
