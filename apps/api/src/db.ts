/**
 * D1 access and the sync merge rules (ADR-0005).
 *
 * Everything a write touches goes through one `db.batch()`. D1 runs a batch as a single
 * transaction, in order, so the first statement bumps the household's revision and every
 * later statement reads that new value back with a subquery. That is what lets a whole
 * mutation batch land atomically under one revision number, with no window in which the
 * counter has moved but the items it describes have not.
 */

import { isCategory, type Category, type Item, type Mutation, type Revision } from '@grocery/shared';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export interface Household {
  id: string;
  revision: Revision;
  purgedThroughRevision: Revision;
}

/** How long a tombstone sticks around so an absent phone still learns about the delete. */
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Reads the household's revision at the moment the enclosing statement runs. */
const CURRENT_REVISION = '(SELECT revision FROM households WHERE id = ?)';

const ITEM_COLUMNS =
  'id, name, name_updated_at, checked, checked_updated_at, category,' +
  ' category_updated_at, deleted_at, created_at, revision';

interface ItemRow {
  id: string;
  name: string;
  name_updated_at: number;
  checked: number;
  checked_updated_at: number;
  category: string | null;
  category_updated_at: number;
  deleted_at: number | null;
  created_at: number;
  revision: number;
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    nameUpdatedAt: row.name_updated_at,
    checked: row.checked !== 0,
    checkedUpdatedAt: row.checked_updated_at,
    // Anything unrecognized -- including rows written before ADR-0008 -- comes back null
    // and renders under "Other".
    category: isCategory(row.category) ? (row.category as Category) : null,
    categoryUpdatedAt: row.category_updated_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    revision: row.revision,
  };
}

export async function createHousehold(
  db: D1Database,
  id: string,
  tokenHash: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO households (id, token_hash, revision, purged_through_revision, created_at)' +
        ' VALUES (?, ?, 0, 0, ?)',
    )
    .bind(id, tokenHash, now)
    .run();
}

/**
 * Look a household up by the hash of its token.
 *
 * Returns null for anything unrecognized; the caller turns that into a 404 rather than a
 * 401, so the server never confirms whether a given household exists (ADR-0004).
 */
export async function findHousehold(
  db: D1Database,
  tokenHash: string,
): Promise<Household | null> {
  const row = await db
    .prepare('SELECT id, revision, purged_through_revision FROM households WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ id: string; revision: number; purged_through_revision: number }>();

  if (!row) return null;
  return {
    id: row.id,
    revision: row.revision,
    purgedThroughRevision: row.purged_through_revision,
  };
}

/**
 * Everything that changed after `since`.
 *
 * The client cannot miss an update here: it asks for a range, not for messages, so a
 * dropped response just means the next poll returns a slightly wider range
 * (ADR-0005 section 5).
 *
 * `resync` tells the client to throw its replica away and take this response as a fresh
 * snapshot. That happens on a first load, on a cursor from the future (which shouldn't
 * occur, but is cheap to be safe about), and on a cursor old enough that the tombstones
 * it needs have already been purged.
 */
export async function listChanges(
  db: D1Database,
  household: Household,
  since: Revision,
): Promise<{ revision: Revision; items: Item[]; resync: boolean }> {
  const resync =
    since <= 0 || since > household.revision || since < household.purgedThroughRevision;

  const query = resync
    ? db
        .prepare(
          `SELECT ${ITEM_COLUMNS} FROM items WHERE household_id = ? AND deleted_at IS NULL` +
            ' ORDER BY revision',
        )
        .bind(household.id)
    : db
        .prepare(
          `SELECT ${ITEM_COLUMNS} FROM items WHERE household_id = ? AND revision > ?` +
            ' ORDER BY revision',
        )
        .bind(household.id, since);

  const { results } = await query.all<ItemRow>();
  return { revision: household.revision, items: results.map(toItem), resync };
}

/**
 * Apply a batch of mutations atomically and return the items it changed.
 *
 * Every statement is written so that replaying it is a no-op: inserts collide on the
 * client-generated id, and field updates only fire when the incoming timestamp is newer
 * than the stored one. That is what makes the whole endpoint safe to retry blindly over a
 * flaky connection (ADR-0005 sections 1 and 4).
 */
export async function applyMutations(
  db: D1Database,
  household: Household,
  mutations: Mutation[],
  now: number,
): Promise<{ revision: Revision; items: Item[] }> {
  const id = household.id;
  const cutoff = now - TOMBSTONE_RETENTION_MS;

  const statements: D1PreparedStatement[] = [
    // Record how far tombstone purging has reached *before* deleting, so a client whose
    // cursor predates the purge is correctly told to resync rather than silently keeping
    // an item we can no longer tell it was deleted.
    db
      .prepare(
        'UPDATE households SET purged_through_revision = MAX(purged_through_revision,' +
          ' COALESCE((SELECT MAX(revision) FROM items WHERE household_id = ?' +
          ' AND deleted_at IS NOT NULL AND deleted_at < ?), 0)) WHERE id = ?',
      )
      .bind(id, cutoff, id),
    db
      .prepare(
        'DELETE FROM items WHERE household_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?',
      )
      .bind(id, cutoff),

    // One bump per batch. Everything below stamps this same new revision.
    db.prepare('UPDATE households SET revision = revision + 1 WHERE id = ?').bind(id),

    ...mutations.map((mutation) => statementFor(db, id, mutation)),

    db.prepare('SELECT revision FROM households WHERE id = ?').bind(id),
    db
      .prepare(
        `SELECT ${ITEM_COLUMNS} FROM items WHERE household_id = ?` +
          ` AND revision = ${CURRENT_REVISION} ORDER BY revision`,
      )
      .bind(id, id),
  ];

  const results = await db.batch(statements);
  const revisionRow = results[results.length - 2]?.results?.[0] as { revision: number } | undefined;
  const changedRows = (results[results.length - 1]?.results ?? []) as unknown as ItemRow[];

  return {
    revision: revisionRow?.revision ?? household.revision + 1,
    items: changedRows.map(toItem),
  };
}

function statementFor(db: D1Database, id: string, mutation: Mutation): D1PreparedStatement {
  switch (mutation.op) {
    case 'addItem':
      // Colliding on the client-generated id is what makes a retried add a no-op rather
      // than a duplicate line on the list.
      return db
        .prepare(
          'INSERT INTO items (id, household_id, name, name_updated_at, checked,' +
            ' checked_updated_at, category, category_updated_at, deleted_at, created_at,' +
            ` revision) VALUES (?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, ${CURRENT_REVISION})` +
            ' ON CONFLICT(id) DO NOTHING',
        )
        .bind(
          mutation.itemId,
          id,
          mutation.name,
          mutation.clientTime,
          mutation.clientTime,
          mutation.category,
          mutation.clientTime,
          mutation.clientTime,
          id,
        );

    case 'renameItem':
      // Touches the name clock only. A concurrent check-off keeps its own newer clock.
      return db
        .prepare(
          `UPDATE items SET name = ?, name_updated_at = ?, revision = ${CURRENT_REVISION}` +
            ' WHERE id = ? AND household_id = ? AND name_updated_at < ?',
        )
        .bind(mutation.name, mutation.clientTime, id, mutation.itemId, id, mutation.clientTime);

    case 'setChecked':
      return db
        .prepare(
          `UPDATE items SET checked = ?, checked_updated_at = ?, revision = ${CURRENT_REVISION}` +
            ' WHERE id = ? AND household_id = ? AND checked_updated_at < ?',
        )
        .bind(
          mutation.checked ? 1 : 0,
          mutation.clientTime,
          id,
          mutation.itemId,
          id,
          mutation.clientTime,
        );

    case 'setCategory':
      // Its own clock, so moving an item between aisles leaves the name and checked state
      // exactly where they were (ADR-0005, ADR-0008).
      return db
        .prepare(
          `UPDATE items SET category = ?, category_updated_at = ?, revision = ${CURRENT_REVISION}` +
            ' WHERE id = ? AND household_id = ? AND category_updated_at < ?',
        )
        .bind(mutation.category, mutation.clientTime, id, mutation.itemId, id, mutation.clientTime);

    case 'deleteItem':
      // Upsert rather than update: if a delete somehow arrives before the add it refers
      // to, we still want a tombstone, so the later add cannot resurrect the item.
      return db
        .prepare(
          'INSERT INTO items (id, household_id, name, name_updated_at, checked,' +
            ' checked_updated_at, category, category_updated_at, deleted_at, created_at,' +
            ` revision) VALUES (?, ?, '', 0, 0, 0, NULL, 0, ?, ?, ${CURRENT_REVISION})` +
            ' ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at,' +
            ' revision = excluded.revision WHERE items.deleted_at IS NULL',
        )
        .bind(mutation.itemId, id, mutation.clientTime, mutation.clientTime, id);

    case 'clearChecked':
      // Expands server-side, so the client sends one small mutation rather than N.
      return db
        .prepare(
          `UPDATE items SET deleted_at = ?, revision = ${CURRENT_REVISION}` +
            ' WHERE household_id = ? AND checked = 1 AND deleted_at IS NULL',
        )
        .bind(mutation.clientTime, id, id);
  }
}
