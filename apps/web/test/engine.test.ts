/**
 * Cursor behavior around a flush.
 *
 * This exists because of a real bug found by driving two browsers: after sending its
 * offline queue, the client set its cursor to the revision that write created. The
 * revisions in between belonged to the *other* phone -- everything it had done while this
 * one was away -- and the next poll skipped straight past them. The other phone's items
 * never arrived and its deletes never took effect.
 *
 * Only a range fetch may move the cursor.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, Mutation } from '@grocery/shared';
import { SyncEngine } from '../src/sync/engine.js';

interface Call {
  url: string;
  body?: unknown;
}

let calls: Call[] = [];

function stubBrowser(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('document', { visibilityState: 'hidden', addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
}

/** A server that is already at revision 8 because the other phone has been busy. */
function stubServer(options: { flushRevision: number; listRevision: number; listItems: Item[] }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.startsWith('/api/mutations')) {
        // Echo back what a real server would: the items this batch wrote, stamped with
        // the revision it created.
        const sent = (JSON.parse(String(init?.body)) as { mutations: Mutation[] }).mutations;
        const written = sent
          .filter((m) => m.op === 'addItem')
          .map((m) => ({
            id: m.itemId,
            name: m.name,
            nameUpdatedAt: m.clientTime,
            checked: false,
            checkedUpdatedAt: m.clientTime,
            category: m.category,
            categoryUpdatedAt: m.clientTime,
            deletedAt: null,
            createdAt: m.clientTime,
            revision: options.flushRevision,
          }));
        return new Response(
          JSON.stringify({ revision: options.flushRevision, items: written }),
          { status: 200 },
        );
      }
      // Honor the cursor, like the real endpoint does. This is what makes a cursor that
      // skipped ahead show up as missing items rather than passing silently.
      const since = Number(new URL(url, 'https://x').searchParams.get('since') ?? '0');
      const inRange = options.listItems.filter((item) => item.revision > since);
      return new Response(
        JSON.stringify({ revision: options.listRevision, items: inRange, resync: false }),
        { status: 200 },
      );
    }),
  );
}

const otherPhonesItem: Item = {
  id: 'theirs',
  name: 'coffee',
  nameUpdatedAt: 10,
  checked: false,
  checkedUpdatedAt: 10,
  category: 'Drinks',
  categoryUpdatedAt: 10,
  deletedAt: null,
  createdAt: 10,
  revision: 6,
};

beforeEach(() => {
  calls = [];
  vi.unstubAllGlobals();
  stubBrowser();
});

describe('the cursor after sending queued changes', () => {
  it('polls from the old cursor, not from the revision the flush created', async () => {
    stubServer({ flushRevision: 8, listRevision: 8, listItems: [otherPhonesItem] });

    const engine = new SyncEngine('token');
    engine.addItem('jam');
    await vi.waitFor(() => expect(calls.some((c) => c.url.startsWith('/api/list'))).toBe(true));

    const listCall = calls.find((c) => c.url.startsWith('/api/list'));
    // A fresh client is at 0. If the flush had moved the cursor to 8, this would ask for
    // "since=8" and the other phone's revisions 1-7 would be lost forever.
    expect(listCall?.url).toBe('/api/list?since=0');
  });

  it('picks up the other phone’s items that landed while this one was offline', async () => {
    stubServer({ flushRevision: 8, listRevision: 8, listItems: [otherPhonesItem] });

    const engine = new SyncEngine('token');
    engine.addItem('jam');
    await vi.waitFor(() =>
      expect(engine.getSnapshot().items.map((i) => i.name).sort()).toEqual(['coffee', 'jam']),
    );
  });

  it('applies a delete the other phone made while this one was offline', async () => {
    const theirDelete: Item = { ...otherPhonesItem, id: 'milk', name: 'milk', deletedAt: 999 };
    stubServer({ flushRevision: 8, listRevision: 8, listItems: [theirDelete] });

    const engine = new SyncEngine('token');
    engine.addItem('jam');
    await vi.waitFor(() =>
      expect(engine.getSnapshot().items.map((i) => i.name)).toEqual(['jam']),
    );
  });

  it('clears the queue once the server has taken it', async () => {
    stubServer({ flushRevision: 8, listRevision: 8, listItems: [] });

    const engine = new SyncEngine('token');
    engine.addItem('jam');
    await vi.waitFor(() => expect(engine.getSnapshot().pendingCount).toBe(0));
    expect(engine.getSnapshot().status).toBe('synced');
  });
});

describe('when the network is gone', () => {
  it('keeps the change queued and says so, rather than losing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const engine = new SyncEngine('token');
    engine.addItem('jam');

    await vi.waitFor(() => expect(engine.getSnapshot().status).toBe('offline'));
    const snapshot = engine.getSnapshot();
    expect(snapshot.pendingCount).toBe(1);
    // The item is on screen immediately regardless -- the network is never on the path
    // between a tap and a pixel.
    expect(snapshot.items.map((i) => i.name)).toEqual(['jam']);
  });

  it('restores the queue from storage after the app is killed and reopened', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const first = new SyncEngine('token');
    first.addItem('jam');
    await vi.waitFor(() => expect(first.getSnapshot().pendingCount).toBe(1));

    // iOS freezes and kills backgrounded web apps without warning; a queue that only
    // lived in memory would take the item with it.
    const reopened = new SyncEngine('token');
    expect(reopened.getSnapshot().pendingCount).toBe(1);
    expect(reopened.getSnapshot().items.map((i) => i.name)).toEqual(['jam']);
  });

  it('starts clean for a different household on the same browser', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const mine = new SyncEngine('token');
    mine.addItem('jam');
    await vi.waitFor(() => expect(mine.getSnapshot().pendingCount).toBe(1));

    expect(new SyncEngine('a-different-token').getSnapshot().items).toEqual([]);
  });
});
