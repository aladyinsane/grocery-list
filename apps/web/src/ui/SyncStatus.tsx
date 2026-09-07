/**
 * The one line on screen that must always be true (principle 2).
 *
 * The app this replaces failed by looking fine while it was quietly out of date. Three
 * seconds of staleness the user knows about is fine; three seconds they don't know about
 * is how trust dies.
 */

import type { SyncSnapshot } from '../sync/index.js';

export function SyncStatus({ snapshot }: { snapshot: SyncSnapshot }) {
  const { status, pendingCount, lastSyncedAt } = snapshot;

  const text =
    status === 'offline'
      ? pendingCount > 0
        ? `Offline — ${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'} waiting`
        : 'Offline'
      : status === 'syncing'
        ? 'Syncing…'
        : lastSyncedAt
          ? `Synced ${relativeTime(lastSyncedAt)}`
          : 'Synced';

  return (
    <p className={`status status--${status}`} role="status" aria-live="polite">
      <span className="status__dot" aria-hidden="true" />
      {text}
    </p>
  );
}

function relativeTime(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
