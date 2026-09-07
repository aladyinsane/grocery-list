# apps/api

The Cloudflare Worker: the sync API, the D1 schema, and the built PWA served from the same
origin (ADR-0003). One `wrangler deploy` publishes both.

```
wrangler.toml            Worker config, D1 binding, static assets binding
migrations/0001_init.sql households + items
src/index.ts             routing and per-request auth
src/auth.ts              token minting and hashing (ADR-0004)
src/db.ts                the sync merge rules in SQL (ADR-0005)
src/http.ts              response helpers and security headers
src/routes/              the three endpoints
```

## The interesting part

`db.ts` puts every write into a single `db.batch()`. D1 runs a batch as one transaction, in
order, so the first statement bumps the household's revision and every later statement
reads that value back with a subquery. A whole mutation batch therefore lands atomically
under one revision number, with no window in which the counter has moved but the items it
describes have not.

The individual statements are written so that replaying them changes nothing: inserts
collide on the client-generated id, and field updates only fire when the incoming
timestamp beats the stored one. That is what makes the endpoint safe to retry blindly.

## Tests

`test/` runs the real migration and the real queries against real SQLite, via Node's
built-in `node:sqlite` and a small D1 shim (`test/d1.ts`). D1 *is* SQLite, so this
exercises the behavior that actually matters — the conditional updates, the `ON CONFLICT`
clauses, the revision subqueries — without a Workers runtime or a network.

```
npm test -w @grocery/api
```
