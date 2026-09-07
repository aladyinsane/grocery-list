/**
 * The sync loop (ADR-0005).
 *
 * Two rules shape all of this. Nothing waits on the network -- every action applies
 * locally first and is queued durably. And we *pull* on a cursor rather than listening
 * for pushes, so there is no message that can go missing: if this phone is behind, the
 * next poll returns the gap, whether that gap is one item or a hundred. Recovery is the
 * same code path as the ordinary case, which means it runs every few seconds instead of
 * once a year.
 */

import type { Item, Mutation } from '@grocery/shared';
import { ApiError, fetchChanges, pushMutations } from './client.js';
import { highestRevision, mergeChanges, replay, visibleItems, type ItemMap } from './merge.js';
import { load, save } from './storage.js';

export type SyncStatus = 'synced' | 'syncing' | 'offline';

export interface SyncSnapshot {
  items: Item[];
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: number | null;
  /** False until we have either restored a cached list or heard from the server. */
  loaded: boolean;
}

/** Poll cadence while the app is open and being used. */
const ACTIVE_INTERVAL_MS = 3_000;
/** Poll cadence while the app is open but untouched. */
const IDLE_INTERVAL_MS = 10_000;
/** How long after a tap we keep treating the session as active. */
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
/** Matches the server's per-request cap. */
const MAX_BATCH = 500;
/** Stops a pathological backlog from monopolizing one tick. */
const MAX_BATCHES_PER_TICK = 10;

export class SyncEngine {
  private server: ItemMap = {};
  private pending: Mutation[] = [];
  private revision = 0;
  private online = true;
  private inFlight = false;
  private syncAgain = false;
  private loaded = false;
  private lastSyncedAt: number | null = null;
  private lastInteraction = Date.now();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: SyncSnapshot;

  constructor(private readonly token: string) {
    const restored = load(token);
    if (restored) {
      this.server = restored.server;
      this.pending = restored.pending;
      this.revision = restored.revision;
      // A cached list renders instantly on a cold open with no signal, which is most of
      // the point of installing this to the home screen at all.
      this.loaded = true;
    }
    this.online = typeof navigator === 'undefined' || navigator.onLine !== false;
    this.snapshot = this.buildSnapshot();
  }

  start(): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('focus', this.handleWake);
    document.addEventListener('visibilitychange', this.handleVisibility);
    void this.syncNow();
    this.schedule();
  }

  stop(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('focus', this.handleWake);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SyncSnapshot => this.snapshot;

  // --- user actions -------------------------------------------------------------------

  addItem(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    // The id is decided here, before the network is involved. That is what makes a
    // retried request impossible to turn into a duplicate line on the list.
    this.enqueue({
      op: 'addItem',
      itemId: crypto.randomUUID(),
      name: trimmed,
      clientTime: Date.now(),
    });
  }

  rename(itemId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.enqueue({ op: 'renameItem', itemId, name: trimmed, clientTime: Date.now() });
  }

  setChecked(itemId: string, checked: boolean): void {
    this.enqueue({ op: 'setChecked', itemId, checked, clientTime: Date.now() });
  }

  remove(itemId: string): void {
    this.enqueue({ op: 'deleteItem', itemId, clientTime: Date.now() });
  }

  clearChecked(): void {
    this.enqueue({ op: 'clearChecked', clientTime: Date.now() });
  }

  // --- internals ----------------------------------------------------------------------

  private enqueue(mutation: Mutation): void {
    this.pending = [...this.pending, mutation];
    this.lastInteraction = Date.now();
    this.persist();
    this.emit();
    void this.syncNow();
    this.schedule();
  }

  private handleOnline = (): void => {
    this.online = true;
    void this.syncNow();
  };

  private handleOffline = (): void => {
    this.online = false;
    this.emit();
  };

  private handleWake = (): void => {
    this.lastInteraction = Date.now();
    void this.syncNow();
    this.schedule();
  };

  private handleVisibility = (): void => {
    if (document.visibilityState === 'visible') this.handleWake();
    else this.schedule();
  };

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Nothing to show while backgrounded, so nothing worth spending battery on.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const active = Date.now() - this.lastInteraction < ACTIVE_WINDOW_MS;
    this.timer = setTimeout(() => {
      void this.syncNow().then(() => this.schedule());
    }, active ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
  }

  private async syncNow(): Promise<void> {
    if (this.inFlight) {
      // Coalesce: whatever prompted this will be covered by the run already going.
      this.syncAgain = true;
      return;
    }
    this.inFlight = true;
    this.emit();

    try {
      await this.flush();
      await this.poll();
      this.online = true;
      this.lastSyncedAt = Date.now();
      this.loaded = true;
    } catch (error) {
      // A 4xx means the request itself was wrong and retrying cannot help, so drop the
      // queue rather than wedging the app on a poison mutation. Anything else -- no
      // signal, a timeout, a 5xx -- keeps the queue and tries again next tick.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        if (error.status !== 404) this.pending = [];
        this.persist();
      }
      this.online = false;
    } finally {
      this.inFlight = false;
      this.emit();
    }

    if (this.syncAgain) {
      this.syncAgain = false;
      await this.syncNow();
    }
  }

  private async flush(): Promise<void> {
    for (let i = 0; i < MAX_BATCHES_PER_TICK && this.pending.length > 0; i += 1) {
      const batch = this.pending.slice(0, MAX_BATCH);
      const result = await pushMutations(this.token, batch);
      // Only the mutations we actually sent leave the queue; anything queued while the
      // request was in flight stays for the next pass.
      this.pending = this.pending.slice(batch.length);
      this.server = mergeChanges(this.server, result.items);
      // Deliberately NOT advancing the cursor to result.revision. Our write lands at the
      // newest revision, but the revisions between our old cursor and that one belong to
      // the other phone -- everything it did while we were offline. Jumping the cursor
      // forward here would skip them permanently. Only poll(), which fetches a whole
      // range, is allowed to move the cursor.
      this.persist();
      this.emit();
    }
  }

  private async poll(): Promise<void> {
    const response = await fetchChanges(this.token, this.revision);
    this.server = response.resync
      ? Object.fromEntries(response.items.map((item) => [item.id, item]))
      : mergeChanges(this.server, response.items);
    this.revision = Math.max(response.revision, highestRevision(response.items, this.revision));
    this.persist();
  }

  private persist(): void {
    save({
      token: this.token,
      revision: this.revision,
      server: this.server,
      pending: this.pending,
    });
  }

  private buildSnapshot(): SyncSnapshot {
    return {
      items: visibleItems(replay(this.server, this.pending)),
      status: this.status(),
      pendingCount: this.pending.length,
      lastSyncedAt: this.lastSyncedAt,
      loaded: this.loaded,
    };
  }

  private status(): SyncStatus {
    if (!this.online) return 'offline';
    // Only call it "syncing" when there is unsent work. A routine poll flickering the
    // status every three seconds would train people to ignore the one line on screen
    // that has to be believed (principle 2).
    if (this.inFlight && this.pending.length > 0) return 'syncing';
    return 'synced';
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }
}
