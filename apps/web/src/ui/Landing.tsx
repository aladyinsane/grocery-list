/** First run: make a household, then hand over the link that *is* the login (ADR-0004). */

import { useState } from 'react';
import { createHousehold, storedToken } from '../sync/index.js';
import { InstallHelp } from './InstallHelp.js';
import { pointManifestAtHousehold } from './manifest.js';

export function Landing() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { token, url } = await createHousehold();
      setCreated(url);
      // Move the browser onto the real list URL so "Add to Home Screen" captures the
      // token, without losing the copyable link above -- and point the manifest at it,
      // since the icon launches the manifest's start_url rather than this page.
      window.history.replaceState(null, '', new URL(url).pathname);
      pointManifestAtHousehold(token);
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

  // If this browser already knows a household, offer to open it. Landing here with a list
  // you already have is how someone accidentally ends up with two of them.
  const existing = storedToken();

  return (
    <div className="landing">
      <h1 className="landing__title">Grocery list</h1>
      {existing ? (
        <>
          <p className="landing__lead">You already have a list on this device.</p>
          <a className="landing__button" href={`/h/${existing}`}>
            Open your list
          </a>
          <p className="landing__note">
            Looking for a list someone shared with you? Open the link they sent — that link
            is the list.
          </p>
        </>
      ) : (
        <>
          <p className="landing__lead">
            A shared list for two phones. No account, no password — just a private link you
            both keep. If someone sent you a link, open that instead — it goes straight to
            their list.
          </p>
          <button
            className="landing__button"
            type="button"
            onClick={() => void create()}
            disabled={busy}
          >
            {busy ? 'Creating…' : 'Create our list'}
          </button>
        </>
      )}
      {error && <p className="landing__error">{error}</p>}
    </div>
  );
}
