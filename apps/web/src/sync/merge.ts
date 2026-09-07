/**
 * The pure half of sync (ADR-0005). No network, no storage, no React -- so every
 * awkward concurrency case is an ordinary table-driven test.
 *
 * The client keeps two things: the last state it saw from the server, and the queue of
 * its own mutations the server has not acknowledged yet. What the screen shows is the
 * first with the second replayed on top. That is why a phone in a dead zone feels
 * completely normal, and why nothing it does can be lost: the queue is durable, and
 * replaying it is deterministic.
 */

import type { Item, Mutation } from '@grocery/shared';

export type ItemMap = Readonly<Record<string, Item>>;

/**
 * Apply one mutation to a map of items.
 *
 * The field clocks mirror the server's rules exactly, so the optimistic view a phone
 * shows is the same state the server will independently arrive at. If these two ever
 * disagree, the next poll silently corrects the phone -- but users notice a checkbox that
 * flickers back, so they are kept in step deliberately.
 */
export function applyMutation(items: ItemMap, mutation: Mutation): ItemMap {
  const next = { ...items };
  const existing = mutation.op === 'clearChecked' ? undefined : next[mutation.itemId];

  switch (mutation.op) {
    case 'addItem': {
      // Colliding on a client-generated id is what makes a replayed add a no-op.
      if (existing) return items;
      next[mutation.itemId] = {
        id: mutation.itemId,
        name: mutation.name,
        nameUpdatedAt: mutation.clientTime,
        checked: false,
        checkedUpdatedAt: mutation.clientTime,
        deletedAt: null,
        createdAt: mutation.clientTime,
        revision: 0,
      };
      return next;
    }

    case 'renameItem': {
      if (!existing || existing.nameUpdatedAt >= mutation.clientTime) return items;
      next[mutation.itemId] = {
        ...existing,
        name: mutation.name,
        nameUpdatedAt: mutation.clientTime,
      };
      return next;
    }

    case 'setChecked': {
      if (!existing || existing.checkedUpdatedAt >= mutation.clientTime) return items;
      next[mutation.itemId] = {
        ...existing,
        checked: mutation.checked,
        checkedUpdatedAt: mutation.clientTime,
      };
      return next;
    }

    case 'deleteItem': {
      // A delete for an item we have never seen still leaves a tombstone, so a late-
      // arriving add cannot resurrect it.
      if (existing?.deletedAt != null) return items;
      next[mutation.itemId] = existing
        ? { ...existing, deletedAt: mutation.clientTime }
        : {
            id: mutation.itemId,
            name: '',
            nameUpdatedAt: 0,
            checked: false,
            checkedUpdatedAt: 0,
            deletedAt: mutation.clientTime,
            createdAt: mutation.clientTime,
            revision: 0,
          };
      return next;
    }

    case 'clearChecked': {
      let changed = false;
      for (const item of Object.values(next)) {
        if (item.checked && item.deletedAt == null) {
          next[item.id] = { ...item, deletedAt: mutation.clientTime };
          changed = true;
        }
      }
      return changed ? next : items;
    }
  }
}

/** The server's state with our un-acknowledged intent layered back on top. */
export function replay(server: ItemMap, pending: readonly Mutation[]): ItemMap {
  return pending.reduce<ItemMap>(applyMutation, server);
}

/**
 * Fold changed items from the server into what we already had.
 *
 * The server has already done the per-field merge, so it wins outright here -- the client
 * never second-guesses it. Local intent comes back via `replay`.
 */
export function mergeChanges(server: ItemMap, changed: readonly Item[]): ItemMap {
  if (changed.length === 0) return server;
  const next = { ...server };
  for (const item of changed) next[item.id] = item;
  return next;
}

/** Drop tombstones and put the list in a stable order: oldest first, as entered. */
export function visibleItems(items: ItemMap): Item[] {
  return Object.values(items)
    .filter((item) => item.deletedAt == null)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
}

/** Highest revision we have seen, used as the next poll's cursor. */
export function highestRevision(items: readonly Item[], current: number): number {
  return items.reduce((max, item) => Math.max(max, item.revision), current);
}
