/**
 * The list, grouped into aisles (ADR-0008).
 *
 * Grouping is unconditional. A short list is mostly headings, which is a real cost, but a
 * list that sometimes groups and sometimes doesn't is a concept to learn, and
 * [principle 3](../../../docs/PRINCIPLES.md) says the feature that needs explaining is the
 * wrong feature.
 *
 * Checked items stay where they are rather than sinking to the bottom: a list that
 * rearranges itself under your thumb mid-aisle is disorienting. "Clear checked" is how
 * they leave.
 */

import { useRef, useState } from 'react';
import { CATEGORIES, type Category, type Item } from '@grocery/shared';
import { groupedItems } from '../sync/merge.js';

/**
 * Whether focus leaving the name field means editing is actually done, rather than just
 * moving to the aisle picker in the same row.
 *
 * This used to be `event.stopPropagation()` on the select's mousedown, which does nothing
 * useful: the browser fires the input's blur as a direct consequence of focus moving away
 * from it, not as an event that bubbles up through the select for stopPropagation to
 * catch. So tapping the picker blurred the name field, which unmounted the picker before
 * the tap could land on it -- it looked like the dropdown just disappeared, because it
 * did. Checking where focus actually landed is the only thing that works.
 *
 * Exported so the decision can be tested without a real browser focus cycle -- see
 * item-row-blur.test.ts.
 */
export function focusLeftTheRow(
  row: { contains(node: EventTarget | null): boolean } | null,
  relatedTarget: EventTarget | null,
): boolean {
  return !(row?.contains(relatedTarget) ?? false);
}

interface Props {
  items: Item[];
  onToggle: (id: string, checked: boolean) => void;
  onRename: (id: string, name: string) => void;
  onRecategorize: (id: string, category: Category) => void;
  onRemove: (id: string) => void;
}

export function ItemList({ items, onToggle, onRename, onRecategorize, onRemove }: Props) {
  if (items.length === 0) {
    return (
      <p className="empty">
        Nothing on the list.
        <br />
        Add something above.
      </p>
    );
  }

  return (
    <div className="aisles">
      {groupedItems(items).map(({ category, items: inAisle }) => (
        <section className="aisle" key={category}>
          <h2 className="aisle__name">{category}</h2>
          <ul className="items">
            {inAisle.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggle={onToggle}
                onRename={onRename}
                onRecategorize={onRecategorize}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onRename,
  onRecategorize,
  onRemove,
}: { item: Item } & Omit<Props, 'items'>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const rowRef = useRef<HTMLLIElement>(null);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== item.name) onRename(item.id, draft);
    else setDraft(item.name);
  }

  return (
    <li className={`item ${item.checked ? 'item--checked' : ''}`} ref={rowRef}>
      <div className="item__row">
        <label className="item__check">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={(event) => onToggle(item.id, event.target.checked)}
            aria-label={item.name}
          />
          <span className="item__box" aria-hidden="true" />
        </label>

        {editing ? (
          <input
            className="item__edit"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => {
              // Tapping the aisle picker moves focus off this input. That must not read
              // as "done editing" -- see focusLeftTheRow above.
              if (focusLeftTheRow(rowRef.current, event.relatedTarget)) commit();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') {
                setDraft(item.name);
                setEditing(false);
              }
            }}
            enterKeyHint="done"
          />
        ) : (
          <button
            className="item__name"
            type="button"
            onClick={() => {
              setDraft(item.name);
              setEditing(true);
            }}
          >
            {item.name}
          </button>
        )}

        <button
          className="item__remove"
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.name}`}
        >
          ×
        </button>
      </div>

      {/*
        The aisle picker only appears while the row is being edited. A select on every row
        would drown the list, and a native select is a wheel on iOS -- no drag-and-drop to
        discover, nothing to explain.
      */}
      {editing && (
        <label className="item__aisle">
          <span className="item__aisle-label">Aisle</span>
          <select
            value={item.category ?? 'Other'}
            aria-label={`Aisle for ${item.name}`}
            onChange={(event) => onRecategorize(item.id, event.target.value as Category)}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      )}
    </li>
  );
}
