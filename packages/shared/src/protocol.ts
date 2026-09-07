/**
 * The wire protocol between the PWA and the Worker.
 *
 * Changes flow as *operations*, never as row overwrites, so that two people editing the
 * same item concurrently both keep their edit. Every operation is idempotent: applying it
 * twice is indistinguishable from applying it once, which is what lets the client retry
 * blindly on a flaky connection (ADR-0005 §1).
 */

import type { Category } from './categories.js';
import type { Item, Revision, Timestamp } from './types.js';

/** Add a new item. Carries the client-generated id, so a retry cannot duplicate it. */
export interface AddItemMutation {
  op: 'addItem';
  itemId: string;
  name: string;
  /** Worked out by the client before sending, so an offline add is categorized too. */
  category: Category;
  clientTime: Timestamp;
}

/** Rename an item. Touches `nameUpdatedAt` only, never the checked state. */
export interface RenameItemMutation {
  op: 'renameItem';
  itemId: string;
  name: string;
  clientTime: Timestamp;
}

/** Check or uncheck an item. Touches `checkedUpdatedAt` only. */
export interface SetCheckedMutation {
  op: 'setChecked';
  itemId: string;
  checked: boolean;
  clientTime: Timestamp;
}

/**
 * Move an item to a different aisle. Touches `categoryUpdatedAt` only, so correcting the
 * category cannot resurrect a stale name or un-check the item (ADR-0008).
 */
export interface SetCategoryMutation {
  op: 'setCategory';
  itemId: string;
  category: Category;
  clientTime: Timestamp;
}

/** Tombstone an item. Not a hard delete — see ADR-0005 §6. */
export interface DeleteItemMutation {
  op: 'deleteItem';
  itemId: string;
  clientTime: Timestamp;
}

/** Tombstone every currently-checked item. Expands server-side into individual deletes. */
export interface ClearCheckedMutation {
  op: 'clearChecked';
  clientTime: Timestamp;
}

export type Mutation =
  | AddItemMutation
  | RenameItemMutation
  | SetCheckedMutation
  | SetCategoryMutation
  | DeleteItemMutation
  | ClearCheckedMutation;

/**
 * `GET /api/list?since=<revision>`
 *
 * Returns everything that changed after `since`. When `resync` is true the client's cursor
 * was older than the tombstone retention window (or unrecognized), so `items` is a full
 * snapshot and the local replica must be replaced rather than merged.
 */
export interface ListResponse {
  revision: Revision;
  items: Item[];
  resync: boolean;
}

/**
 * `POST /api/mutations`
 *
 * Applies a batch atomically and returns the items it changed, so the client can reconcile
 * without waiting for the next poll.
 */
export interface MutationsRequest {
  mutations: Mutation[];
}

export interface MutationsResponse {
  revision: Revision;
  items: Item[];
}

/** `POST /api/households` — the plaintext token is returned here and never again. */
export interface CreateHouseholdResponse {
  token: string;
  url: string;
}
