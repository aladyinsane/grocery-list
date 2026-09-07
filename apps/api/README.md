# apps/api

The Cloudflare Worker: the JSON API, the D1 schema and migrations, and the static asset
binding that serves the built PWA from the same origin (ADR-0003).

**Not yet implemented — this arrives in PR 2.** Planned contents:

```
wrangler.toml            # Worker config, D1 binding, static assets binding
migrations/0001_init.sql # households + items tables
src/index.ts             # fetch handler and routing
src/auth.ts              # household token hashing and lookup (ADR-0004)
src/db.ts                # D1 queries, revision counter transaction
src/routes/household.ts  # POST /api/households
src/routes/sync.ts       # GET /api/list, POST /api/mutations (ADR-0005)
```
