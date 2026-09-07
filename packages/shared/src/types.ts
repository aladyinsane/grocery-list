/**
 * Core domain types.
 *
 * These are shared verbatim between the Worker (`apps/api`) and the PWA (`apps/web`)
 * so that the two halves of the sync protocol cannot drift apart.
 *
 * See ADR-0005 for why the shape is what it is.
 */

import type { Category } from './categories.js';

/** Milliseconds since the Unix epoch. */
export type Timestamp = number;

/**
 * A household's monotonically increasing write counter.
 *
 * Bumped inside a transaction on every write and stamped onto each item touched, so a
 * client can ask "what changed after N?" and be certain of missing nothing (ADR-0005 §5).
 */
export type Revision = number;

/**
 * One item on the list.
 *
 * `id` is generated on the client before the item is ever sent, which is what makes every
 * mutation idempotent under retry (ADR-0005 §1).
 *
 * `name` and `checked` carry independent timestamps so they can be merged separately —
 * renaming an item must not resurrect its old checked state (ADR-0005 §4).
 */
export interface Item {
  id: string;
  name: string;
  nameUpdatedAt: Timestamp;
  checked: boolean;
  checkedUpdatedAt: Timestamp;
  /**
   * The aisle this item belongs in (ADR-0008), assigned when it was added and correctable
   * by hand. Null for items that predate categorization; they render under "Other".
   */
  category: Category | null;
  categoryUpdatedAt: Timestamp;
  /** Tombstone. Non-null means deleted; retained 30 days so deletes reach absent clients. */
  deletedAt: Timestamp | null;
  createdAt: Timestamp;
  /** The household revision at this item's last write. Doubles as the sync cursor. */
  revision: Revision;
}
