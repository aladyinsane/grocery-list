/**
 * The sync scenarios ADR-0005 exists to prevent.
 *
 * Every one of these is a way a shared list goes quietly wrong in real use, so each test
 * is named for the situation rather than the function it exercises.
 */

import { describe, expect, it } from 'vitest';
import type { Item, Mutation } from '@grocery/shared';
import {
  applyMutation,
  highestRevision,
  mergeChanges,
  replay,
  visibleItems,
  type ItemMap,
} from '../src/sync/merge.js';

function item(overrides: Partial<Item> & Pick<Item, 'id'>): Item {
  return {
    name: 'milk',
    nameUpdatedAt: 100,
    checked: false,
    checkedUpdatedAt: 100,
    deletedAt: null,
    createdAt: 100,
    revision: 1,
    ...overrides,
  };
}

const add = (id: string, name: string, at: number): Mutation => ({
  op: 'addItem',
  itemId: id,
  name,
  clientTime: at,
});

describe('adding items', () => {
  it('shows the item immediately, before any network call', () => {
    const result = applyMutation({}, add('a', 'oat milk', 500));
    expect(visibleItems(result).map((i) => i.name)).toEqual(['oat milk']);
  });

  it('cannot duplicate an item when the same add is replayed', () => {
    // The retry case: a request that looked like it failed but actually succeeded.
    const once = applyMutation({}, add('a', 'milk', 500));
    const twice = applyMutation(once, add('a', 'milk', 500));
    expect(visibleItems(twice)).toHaveLength(1);
    expect(twice).toBe(once);
  });
});

describe('concurrent edits from two phones', () => {
  it('keeps both a rename and a check-off of the same item', () => {
    // The bug this whole per-field design exists to prevent: you check something off,
    // your partner renames it, and whole-row merging makes one edit undo the other.
    const start: ItemMap = { a: item({ id: 'a', name: 'milk' }) };

    const renamed = applyMutation(start, {
      op: 'renameItem',
      itemId: 'a',
      name: 'oat milk',
      clientTime: 200,
    });
    const both = applyMutation(renamed, {
      op: 'setChecked',
      itemId: 'a',
      checked: true,
      clientTime: 201,
    });

    expect(both['a']?.name).toBe('oat milk');
    expect(both['a']?.checked).toBe(true);
  });

  it('ignores an edit older than the one already applied', () => {
    const start: ItemMap = { a: item({ id: 'a', name: 'oat milk', nameUpdatedAt: 500 }) };
    const stale = applyMutation(start, {
      op: 'renameItem',
      itemId: 'a',
      name: 'milk',
      clientTime: 200,
    });
    expect(stale['a']?.name).toBe('oat milk');
  });

  it('does not let a rename resurrect a stale checked state', () => {
    const start: ItemMap = {
      a: item({ id: 'a', checked: true, checkedUpdatedAt: 900, nameUpdatedAt: 100 }),
    };
    const renamed = applyMutation(start, {
      op: 'renameItem',
      itemId: 'a',
      name: 'oat milk',
      clientTime: 200,
    });
    expect(renamed['a']?.checked).toBe(true);
  });
});

describe('deletes', () => {
  it('hides the item but keeps a tombstone', () => {
    const start: ItemMap = { a: item({ id: 'a' }) };
    const deleted = applyMutation(start, { op: 'deleteItem', itemId: 'a', clientTime: 300 });
    expect(visibleItems(deleted)).toHaveLength(0);
    expect(deleted['a']?.deletedAt).toBe(300);
  });

  it('survives a delete that arrives before the add it refers to', () => {
    // Without a tombstone the late add would resurrect the item -- the zombie case.
    const deleted = applyMutation({}, { op: 'deleteItem', itemId: 'a', clientTime: 300 });
    const thenAdded = applyMutation(deleted, add('a', 'milk', 200));
    expect(visibleItems(thenAdded)).toHaveLength(0);
  });

  it('clears every checked item and leaves the rest alone', () => {
    const start: ItemMap = {
      a: item({ id: 'a', name: 'milk', checked: true, createdAt: 1 }),
      b: item({ id: 'b', name: 'bread', checked: false, createdAt: 2 }),
      c: item({ id: 'c', name: 'eggs', checked: true, createdAt: 3 }),
    };
    const cleared = applyMutation(start, { op: 'clearChecked', clientTime: 400 });
    expect(visibleItems(cleared).map((i) => i.name)).toEqual(['bread']);
  });
});

describe('the offline queue', () => {
  it('replays a whole airplane-mode session on top of the server state', () => {
    // Three adds, a rename and a check-off, all made with no signal.
    const server: ItemMap = { a: item({ id: 'a', name: 'milk', createdAt: 1 }) };
    const pending: Mutation[] = [
      add('b', 'bread', 200),
      add('c', 'eggs', 201),
      add('d', 'jam', 202),
      { op: 'renameItem', itemId: 'b', name: 'sourdough', clientTime: 203 },
      { op: 'setChecked', itemId: 'c', checked: true, clientTime: 204 },
    ];

    const view = visibleItems(replay(server, pending));
    expect(view.map((i) => i.name)).toEqual(['milk', 'sourdough', 'eggs', 'jam']);
    expect(view.find((i) => i.name === 'eggs')?.checked).toBe(true);
  });

  it('leaves the server state untouched so it can be replayed again', () => {
    const server: ItemMap = { a: item({ id: 'a' }) };
    replay(server, [add('b', 'bread', 200)]);
    expect(Object.keys(server)).toEqual(['a']);
  });

  it('converges when the other phone deleted an item we still have queued edits for', () => {
    const server: ItemMap = { a: item({ id: 'a', name: 'milk' }) };
    const afterTheirDelete = mergeChanges(server, [
      item({ id: 'a', name: 'milk', deletedAt: 700, revision: 9 }),
    ]);
    const withOurEdit = replay(afterTheirDelete, [
      { op: 'setChecked', itemId: 'a', checked: true, clientTime: 800 },
    ]);
    // The delete wins: a checked tombstone is still a tombstone.
    expect(visibleItems(withOurEdit)).toHaveLength(0);
  });
});

describe('catching up from the server', () => {
  it('takes the server version of an item over its own', () => {
    const local: ItemMap = { a: item({ id: 'a', name: 'milk', revision: 1 }) };
    const merged = mergeChanges(local, [item({ id: 'a', name: 'oat milk', revision: 4 })]);
    expect(merged['a']?.name).toBe('oat milk');
  });

  it('advances the cursor to the highest revision seen', () => {
    const changed = [item({ id: 'a', revision: 4 }), item({ id: 'b', revision: 7 })];
    expect(highestRevision(changed, 2)).toBe(7);
  });

  it('never moves the cursor backwards', () => {
    expect(highestRevision([item({ id: 'a', revision: 2 })], 9)).toBe(9);
  });
});

describe('list ordering', () => {
  it('keeps entry order and leaves checked items in place', () => {
    // Reordering the list under someone's thumb mid-aisle is disorienting.
    const items: ItemMap = {
      b: item({ id: 'b', name: 'bread', createdAt: 2, checked: true }),
      a: item({ id: 'a', name: 'milk', createdAt: 1 }),
      c: item({ id: 'c', name: 'eggs', createdAt: 3 }),
    };
    expect(visibleItems(items).map((i) => i.name)).toEqual(['milk', 'bread', 'eggs']);
  });
});
