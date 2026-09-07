/**
 * Server-side sync behavior, against a real SQLite database and the real migration.
 *
 * These cover the guarantees ADR-0005 makes on the server: idempotent replay, per-field
 * merging, the revision cursor, and the tombstone/resync fallback.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Mutation } from '@grocery/shared';
import { applyMutations, createHousehold, findHousehold, listChanges } from '../src/db.js';
import type { Household } from '../src/db.js';
import { asD1, FakeD1 } from './d1.js';
import { generateToken, hashToken } from '../src/auth.js';

const DAY = 24 * 60 * 60 * 1000;

let fake: FakeD1;
let db: D1Database;
let household: Household;

beforeEach(async () => {
  fake = new FakeD1();
  db = asD1(fake);
  await createHousehold(db, 'house-1', await hashToken('secret'), 1_000);
  household = (await findHousehold(db, await hashToken('secret')))!;
});

/** applyMutations needs the household's current revision, so re-read between batches. */
async function refresh(): Promise<Household> {
  household = (await findHousehold(db, await hashToken('secret')))!;
  return household;
}

async function apply(mutations: Mutation[], now = 10_000) {
  const result = await applyMutations(db, await refresh(), mutations, now);
  await refresh();
  return result;
}

const add = (id: string, name: string, at = 5_000): Mutation => ({
  op: 'addItem',
  itemId: id,
  name,
  clientTime: at,
});

describe('household lookup', () => {
  it('finds a household by the hash of its token', async () => {
    expect(household.id).toBe('house-1');
    expect(household.revision).toBe(0);
  });

  it('returns nothing for an unknown token, so the caller can 404', async () => {
    expect(await findHousehold(db, await hashToken('wrong'))).toBeNull();
  });

  it('mints tokens that are unique and URL-safe', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });
});

describe('applying mutations', () => {
  it('stamps one revision on everything in a batch', async () => {
    const result = await apply([add('a', 'milk'), add('b', 'bread')]);
    expect(result.revision).toBe(1);
    expect(result.items.map((i) => i.name).sort()).toEqual(['bread', 'milk']);
    expect(new Set(result.items.map((i) => i.revision))).toEqual(new Set([1]));
  });

  it('does not duplicate an item when the same add is replayed', async () => {
    // The retry case: the client never learned that the first attempt succeeded.
    await apply([add('a', 'milk')]);
    await apply([add('a', 'milk')]);

    const { items } = await listChanges(db, await refresh(), 0);
    expect(items).toHaveLength(1);
  });

  it('merges a rename and a check-off of the same item independently', async () => {
    await apply([add('a', 'milk', 5_000)]);
    await apply([
      { op: 'renameItem', itemId: 'a', name: 'oat milk', clientTime: 6_000 },
      { op: 'setChecked', itemId: 'a', checked: true, clientTime: 6_001 },
    ]);

    const { items } = await listChanges(db, await refresh(), 0);
    expect(items[0]?.name).toBe('oat milk');
    expect(items[0]?.checked).toBe(true);
  });

  it('ignores a field edit older than what is already stored', async () => {
    await apply([add('a', 'milk', 5_000)]);
    await apply([{ op: 'renameItem', itemId: 'a', name: 'oat milk', clientTime: 9_000 }]);
    await apply([{ op: 'renameItem', itemId: 'a', name: 'stale', clientTime: 6_000 }]);

    const { items } = await listChanges(db, await refresh(), 0);
    expect(items[0]?.name).toBe('oat milk');
  });

  it('expands clearChecked into a tombstone per checked item', async () => {
    await apply([add('a', 'milk'), add('b', 'bread'), add('c', 'eggs')]);
    await apply([
      { op: 'setChecked', itemId: 'a', checked: true, clientTime: 6_000 },
      { op: 'setChecked', itemId: 'c', checked: true, clientTime: 6_000 },
    ]);
    await apply([{ op: 'clearChecked', clientTime: 7_000 }]);

    const { items } = await listChanges(db, await refresh(), 0);
    expect(items.map((i) => i.name)).toEqual(['bread']);
  });

  it('keeps a delete that arrived before the add it refers to', async () => {
    // Out of order, so the tombstone has to win or the item comes back from the dead.
    await apply([{ op: 'deleteItem', itemId: 'a', clientTime: 6_000 }]);
    await apply([add('a', 'milk', 5_000)]);

    const { items } = await listChanges(db, await refresh(), 0);
    expect(items).toHaveLength(0);
  });

  it('scopes every write to its own household', async () => {
    await createHousehold(db, 'house-2', await hashToken('other'), 1_000);
    const other = (await findHousehold(db, await hashToken('other')))!;

    await apply([add('a', 'milk')]);
    await applyMutations(db, other, [{ op: 'clearChecked', clientTime: 9_000 }], 10_000);

    const { items } = await listChanges(db, await refresh(), 0);
    expect(items).toHaveLength(1);
  });
});

describe('the revision cursor', () => {
  it('returns only what changed after the cursor', async () => {
    await apply([add('a', 'milk')]);
    const afterFirst = household.revision;
    await apply([add('b', 'bread')]);

    const { items, resync } = await listChanges(db, await refresh(), afterFirst);
    expect(resync).toBe(false);
    expect(items.map((i) => i.name)).toEqual(['bread']);
  });

  it('returns nothing when the client is already up to date', async () => {
    await apply([add('a', 'milk')]);
    const { items } = await listChanges(db, await refresh(), household.revision);
    expect(items).toHaveLength(0);
  });

  it('reports deletes to a client that is behind, so it can drop the item', async () => {
    await apply([add('a', 'milk')]);
    const beforeDelete = household.revision;
    await apply([{ op: 'deleteItem', itemId: 'a', clientTime: 8_000 }]);

    const { items } = await listChanges(db, await refresh(), beforeDelete);
    expect(items).toHaveLength(1);
    expect(items[0]?.deletedAt).toBe(8_000);
  });

  it('sends a full snapshot on a first load, with no tombstones in it', async () => {
    await apply([add('a', 'milk'), add('b', 'bread')]);
    await apply([{ op: 'deleteItem', itemId: 'a', clientTime: 8_000 }]);

    const { items, resync } = await listChanges(db, await refresh(), 0);
    expect(resync).toBe(true);
    expect(items.map((i) => i.name)).toEqual(['bread']);
  });

  it('forces a resync for a cursor from the future', async () => {
    const { resync } = await listChanges(db, await refresh(), 999);
    expect(resync).toBe(true);
  });
});

describe('tombstone retention', () => {
  it('forces a resync once the deletes a stale client needs have been purged', async () => {
    await apply([add('a', 'milk'), add('b', 'bread')]);
    const staleCursor = household.revision;

    // Deleted well over the 30-day retention window ago.
    const longAgo = 100 * DAY;
    await apply([{ op: 'deleteItem', itemId: 'a', clientTime: longAgo }], longAgo);

    // A later write triggers the opportunistic purge, at a "now" past the window.
    await apply([add('c', 'eggs', 200 * DAY)], 200 * DAY);

    const refreshed = await refresh();
    expect(refreshed.purgedThroughRevision).toBeGreaterThan(staleCursor);

    const { resync, items } = await listChanges(db, refreshed, staleCursor);
    expect(resync).toBe(true);
    // The snapshot simply omits the purged item, which is how the client learns it is gone.
    expect(items.map((i) => i.name).sort()).toEqual(['bread', 'eggs']);
  });

  it('keeps recent tombstones so a phone offline for a week still sees the delete', async () => {
    await apply([add('a', 'milk')]);
    const cursor = household.revision;
    const now = 40 * DAY;
    await apply([{ op: 'deleteItem', itemId: 'a', clientTime: now - 3 * DAY }], now);
    await apply([add('b', 'bread', now)], now);

    const { resync, items } = await listChanges(db, await refresh(), cursor);
    expect(resync).toBe(false);
    expect(items.find((i) => i.id === 'a')?.deletedAt).toBe(now - 3 * DAY);
  });
});
