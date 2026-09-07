/**
 * The Worker's routing, auth and response shape (ADR-0004), driven through real Requests.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/db.js';
import { asD1, FakeD1 } from './d1.js';

let env: Env;

beforeEach(() => {
  env = {
    DB: asD1(new FakeD1()),
    // Nothing under /api touches the assets binding; this proves that stays true.
    ASSETS: {
      fetch: async () => new Response('the app shell', { status: 200 }),
    } as unknown as Fetcher,
  };
});

const call = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://groceries.example${path}`, init), env);

async function newHousehold(): Promise<string> {
  const response = await call('/api/households', { method: 'POST' });
  const body = (await response.json()) as { token: string };
  return body.token;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('creating a household', () => {
  it('returns a token and the link that carries it', async () => {
    const response = await call('/api/households', { method: 'POST' });
    expect(response.status).toBe(201);

    const body = (await response.json()) as { token: string; url: string };
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(body.url).toBe(`https://groceries.example/h/${body.token}`);
  });

  it('refuses anything but POST', async () => {
    expect((await call('/api/households')).status).toBe(405);
  });
});

describe('authentication', () => {
  it('404s a request with no token, rather than admitting the endpoint exists', async () => {
    expect((await call('/api/list')).status).toBe(404);
  });

  it('404s an unknown token, so a guess learns nothing', async () => {
    // Not 401 or 403: the response must not distinguish "wrong token" from "no such
    // household" (ADR-0004).
    const response = await call('/api/list', { headers: auth('definitely-not-a-real-token') });
    expect(response.status).toBe(404);
  });

  it('404s a malformed Authorization header', async () => {
    const response = await call('/api/list', { headers: { Authorization: 'Basic hunter2' } });
    expect(response.status).toBe(404);
  });

  it('keeps households from seeing each other', async () => {
    const [mine, theirs] = [await newHousehold(), await newHousehold()];
    await call('/api/mutations', {
      method: 'POST',
      headers: { ...auth(mine), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mutations: [{ op: 'addItem', itemId: 'a', name: 'milk', clientTime: 1 }],
      }),
    });

    const response = await call('/api/list', { headers: auth(theirs) });
    const body = (await response.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});

describe('a full round trip', () => {
  it('adds an item and reads it back on the cursor', async () => {
    const token = await newHousehold();

    const pushed = await call('/api/mutations', {
      method: 'POST',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mutations: [{ op: 'addItem', itemId: 'a', name: 'milk', clientTime: 1 }],
      }),
    });
    expect(pushed.status).toBe(200);
    const { revision } = (await pushed.json()) as { revision: number };

    const caughtUp = await call(`/api/list?since=${revision}`, { headers: auth(token) });
    const body = (await caughtUp.json()) as { items: unknown[]; resync: boolean };
    expect(body.items).toHaveLength(0);
    expect(body.resync).toBe(false);
  });
});

describe('rejecting bad input', () => {
  const post = async (body: string) =>
    call('/api/mutations', {
      method: 'POST',
      headers: { ...auth(await newHousehold()), 'Content-Type': 'application/json' },
      body,
    });

  it('rejects a body that is not JSON', async () => {
    expect((await post('not json')).status).toBe(400);
  });

  it('rejects an empty batch', async () => {
    expect((await post(JSON.stringify({ mutations: [] }))).status).toBe(400);
  });

  it('rejects an unknown operation', async () => {
    const body = JSON.stringify({ mutations: [{ op: 'dropTable', clientTime: 1 }] });
    expect((await post(body)).status).toBe(400);
  });

  it('rejects a mutation with a non-numeric clock', async () => {
    // A garbage timestamp could park an item permanently in the future, where no later
    // edit could ever win.
    const body = JSON.stringify({
      mutations: [{ op: 'addItem', itemId: 'a', name: 'milk', clientTime: 'now' }],
    });
    expect((await post(body)).status).toBe(400);
  });

  it('rejects an empty item name', async () => {
    const body = JSON.stringify({
      mutations: [{ op: 'addItem', itemId: 'a', name: '', clientTime: 1 }],
    });
    expect((await post(body)).status).toBe(400);
  });
});

describe('serving the app', () => {
  it('hands anything outside /api to the static assets', async () => {
    // /h/<token> has no file behind it; the SPA fallback serves index.html and the app
    // reads the token out of the path.
    const response = await call('/h/some-token');
    expect(await response.text()).toBe('the app shell');
  });
});

describe('response headers', () => {
  it('never leaks the token in a referrer', async () => {
    // The URL *is* the credential, so a Referer header would hand over the whole list.
    const response = await call('/api/households', { method: 'POST' });
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('never caches the list', async () => {
    const token = await newHousehold();
    const response = await call('/api/list', { headers: auth(token) });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
