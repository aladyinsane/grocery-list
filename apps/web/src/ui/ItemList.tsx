/**
 * The list.
 *
 * Checked items stay where they are rather than jumping to the bottom -- you are walking
 * aisles in a fixed order, and having the list rearrange itself under your thumb is
 * disorienting. "Clear checked" is how they leave.
 */

import { useState } from 'react';
import type { Item } from '@grocery/shared';

interface Props {
  items: Item[];
  onToggle: (id: string, checked: boolean) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

export function ItemList({ items, onToggle, onRename, onRemove }: Props) {
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
    <ul className="items">
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          onToggle={onToggle}
          onRename={onRename}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

function ItemRow({ item, onToggle, onRename, onRemove }: { item: Item } & Omit<Props, 'items'>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);

  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== item.name) onRename(item.id, draft);
    else setDraft(item.name);
  }

  return (
    <li className={`item ${item.checked ? 'item--checked' : ''}`}>
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
          onBlur={commit}
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
    </li>
  );
}
