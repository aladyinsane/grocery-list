/** First run: make a household, then hand over the link that *is* the login (ADR-0004). */

import { useState } from 'react';
import { createHousehold } from '../sync/index.js';
import { InstallHelp } from './InstallHelp.js';

export function Landing() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await createHousehold();
      setCreated(url);
      // Move the browser onto the real list URL so "Add to Home Screen" captures the
      // token, without losing the copyable link above.
      window.history.replaceState(null, '', new URL(url).pathname);
    } catch {
      setError('Could not create the list. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="landing">
        <h1 className="landing__title">Your list is ready</h1>
        <p className="landing__lead">
          This link is the list. Anyone you send it to can see and edit it — and anyone you
          don’t, can’t. Keep it somewhere safe, like a house key.
        </p>
        <input className="landing__link" value={created} readOnly onFocus={(e) => e.target.select()} />
        <button
          className="landing__button"
          type="button"
          onClick={() => void navigator.clipboard?.writeText(created)}
        >
          Copy link
        </button>
        <InstallHelp />
      </div>
    );
  }

  return (
    <div className="landing">
      <h1 className="landing__title">Grocery list</h1>
      <p className="landing__lead">
        A shared list for two phones. No account, no password — just a private link you
        both keep.
      </p>
      <button className="landing__button" type="button" onClick={() => void create()} disabled={busy}>
        {busy ? 'Creating…' : 'Create our list'}
      </button>
      {error && <p className="landing__error">{error}</p>}
    </div>
  );
}
