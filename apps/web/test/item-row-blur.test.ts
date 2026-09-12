/**
 * The aisle picker used to vanish the instant you tapped it: the name field's blur fired
 * before the tap on the select could land, and the old fix (stopPropagation on the
 * select's mousedown) never actually reached that blur -- it stops an event bubbling
 * through ancestors, and the input's blur isn't reached that way. This pins the real
 * decision -- did focus actually leave the row, or just move to another control in it --
 * without needing a real browser focus cycle.
 */

import { describe, expect, it } from 'vitest';
import { focusLeftTheRow } from '../src/ui/ItemList.js';

function fakeRow(contains: (node: EventTarget | null) => boolean) {
  return { contains };
}

describe('deciding whether the name field losing focus means editing is done', () => {
  it('stays in editing when focus moves to something else in the same row (the aisle picker)', () => {
    const select = {} as EventTarget;
    const row = fakeRow((node) => node === select);
    expect(focusLeftTheRow(row, select)).toBe(false);
  });

  it('exits editing when focus moves outside the row entirely', () => {
    const somewhereElse = {} as EventTarget;
    const row = fakeRow(() => false);
    expect(focusLeftTheRow(row, somewhereElse)).toBe(true);
  });

  it('exits editing when nothing gains focus at all', () => {
    const row = fakeRow(() => false);
    expect(focusLeftTheRow(row, null)).toBe(true);
  });

  it('exits editing if the row element is not available', () => {
    // Defensive: should never happen with a mounted <li>, but "we can't tell" must not
    // mean "stay open forever."
    expect(focusLeftTheRow(null, null)).toBe(true);
  });
});
