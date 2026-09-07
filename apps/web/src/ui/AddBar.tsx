/** Type, submit, done -- and the field keeps focus so several items go in as a run. */

import { useRef, useState } from 'react';

export function AddBar({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  return (
    <form
      className="addbar"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(value);
        setValue('');
        input.current?.focus();
      }}
    >
      <input
        ref={input}
        className="addbar__input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Add an item"
        aria-label="Add an item"
        enterKeyHint="done"
        autoComplete="off"
        autoCapitalize="sentences"
        autoCorrect="on"
      />
      <button className="addbar__button" type="submit" disabled={!value.trim()}>
        Add
      </button>
    </form>
  );
}
