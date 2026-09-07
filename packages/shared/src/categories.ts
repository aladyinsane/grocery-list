/**
 * Grocery aisles, in the order you walk a shop (ADR-0008).
 *
 * "Other" is always last: it is where anything unrecognized lands, and it is the one
 * category the user is expected to correct from.
 */

export const CATEGORIES = [
  'Produce',
  'Bakery',
  'Dairy & Eggs',
  'Meat & Fish',
  'Frozen',
  'Pantry',
  'Drinks',
  'Household',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const UNCATEGORIZED: Category = 'Other';

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/** Where a category sits on the walk through the shop. Unknown values sort to the end. */
export function categoryOrder(category: Category | null): number {
  const index = category === null ? -1 : CATEGORIES.indexOf(category);
  return index === -1 ? CATEGORIES.length : index;
}
