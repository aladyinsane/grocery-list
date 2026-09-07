/**
 * Durable client state (ADR-0005 section 2).
 *
 * The mutation queue is written to localStorage *before* anything is sent, and cleared
 * only once the server has acknowledged it. iOS will freeze and eventually kill a
 * backgrounded web app without warning; the queue has to survive that, a crash, and a
 * reboot, because the alternative is an item the user typed quietly evaporating.
 *
 * Every read is defensive. Safari can clear this store, and a corrupted or absent value
 * has to degrade to "start from a clean slate and resync" rather than a blank screen.
 */

import type { Mutation } from '@grocery/shared';
import type { ItemMap } from './merge.js';

const KEY = 'grocery-list:v1';

export interface PersistedState {
  token: string;
  revision: number;
  server: ItemMap;
  pending: Mutation[];
}

export function load(token: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    // A different household on the same browser starts fresh rather than inheriting
    // someone else's list.
    if (parsed.token !== token) return null;
    if (typeof parsed.revision !== 'number' || !parsed.server || !Array.isArray(parsed.pending)) {
      return null;
    }
    return {
      token,
      revision: parsed.revision,
      server: parsed.server,
      pending: parsed.pending,
    };
  } catch {
    return null;
  }
}

/**
 * The household this browser last opened, if any.
 *
 * Only useful in the browser that created or opened the list — an installed iOS web app
 * gets a storage jar separate from Safari's, so it will find nothing here. That is exactly
 * why the token has to live in the launch URL.
 */
export function storedToken(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return typeof parsed.token === 'string' ? parsed.token : null;
  } catch {
    return null;
  }
}

export function save(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Out of quota, or storage disabled. The server still holds the truth, so the cost is
    // a resync on next launch rather than lost data -- not worth breaking the app over.
  }
}

const TOKEN_PATH = /^\/h\/([A-Za-z0-9_-]+)\/?$/;

/**
 * The household token lives in the URL, and stays there.
 *
 * Stripping it would be tidier, but the home screen bookmark stores whatever URL was
 * showing when it was created -- so the token in the path *is* the thing that keeps the
 * icon working forever without a login (ADR-0004).
 */
export function tokenFromLocation(pathname: string): string | null {
  return TOKEN_PATH.exec(pathname)?.[1] ?? null;
}
