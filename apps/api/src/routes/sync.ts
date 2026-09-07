/** The two sync endpoints (ADR-0005). Both are idempotent and safe to retry. */

import type { ListResponse, Mutation, MutationsResponse } from '@grocery/shared';
import { applyMutations, listChanges, type Env, type Household } from '../db.js';
import { badRequest, json } from '../http.js';

/** How many mutations one request may carry. Generous for a grocery list, bounded for us. */
const MAX_MUTATIONS = 500;

const MAX_NAME_LENGTH = 200;

export async function handleList(
  request: Request,
  env: Env,
  household: Household,
): Promise<Response> {
  const since = Number(new URL(request.url).searchParams.get('since') ?? '0');
  if (!Number.isFinite(since)) return badRequest('since must be a number');

  const result = await listChanges(env.DB, household, since);
  return json<ListResponse>(result);
}

export async function handleMutations(
  request: Request,
  env: Env,
  household: Household,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('body must be JSON');
  }

  const mutations = (body as { mutations?: unknown })?.mutations;
  if (!Array.isArray(mutations)) return badRequest('mutations must be an array');
  if (mutations.length === 0) return badRequest('mutations must not be empty');
  if (mutations.length > MAX_MUTATIONS) return badRequest(`at most ${MAX_MUTATIONS} mutations`);

  const validated: Mutation[] = [];
  for (const candidate of mutations) {
    const mutation = validate(candidate);
    if (!mutation) return badRequest('malformed mutation');
    validated.push(mutation);
  }

  const result = await applyMutations(env.DB, household, validated, Date.now());
  return json<MutationsResponse>(result);
}

/**
 * Reject anything malformed before it reaches SQL.
 *
 * Client timestamps are advisory -- they order edits to the same field against each other
 * and nothing more -- but a garbage one could still park an item permanently in the future
 * where no later edit can win, so they have to be real numbers.
 */
function validate(value: unknown): Mutation | null {
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Record<string, unknown>;

  const clientTime = m['clientTime'];
  if (typeof clientTime !== 'number' || !Number.isFinite(clientTime)) return null;

  const itemId = m['itemId'];
  const hasItemId = typeof itemId === 'string' && itemId.length > 0 && itemId.length <= 64;

  const name = m['name'];
  const hasName = typeof name === 'string' && name.length > 0 && name.length <= MAX_NAME_LENGTH;

  switch (m['op']) {
    case 'addItem':
      return hasItemId && hasName
        ? { op: 'addItem', itemId: itemId as string, name: name as string, clientTime }
        : null;
    case 'renameItem':
      return hasItemId && hasName
        ? { op: 'renameItem', itemId: itemId as string, name: name as string, clientTime }
        : null;
    case 'setChecked':
      return hasItemId && typeof m['checked'] === 'boolean'
        ? {
            op: 'setChecked',
            itemId: itemId as string,
            checked: m['checked'] as boolean,
            clientTime,
          }
        : null;
    case 'deleteItem':
      return hasItemId ? { op: 'deleteItem', itemId: itemId as string, clientTime } : null;
    case 'clearChecked':
      return { op: 'clearChecked', clientTime };
    default:
      return null;
  }
}
