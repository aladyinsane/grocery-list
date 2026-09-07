# apps/web

The PWA: React + TypeScript + Vite, installed to the iPhone home screen (ADR-0002).

**Not yet implemented — this arrives in PR 2.** Planned contents:

```
vite.config.ts           # includes vite-plugin-pwa for the service worker and manifest
src/main.tsx
src/App.tsx
src/sync/                # local replica, durable mutation queue, poller, merge (ADR-0005)
src/ui/                  # ItemList, AddBar, SyncStatus, InstallHelp
```

The sync merge logic in `src/sync/` is pure and unit-tested without a network — see
ADR-0005 for the scenarios it has to get right.
