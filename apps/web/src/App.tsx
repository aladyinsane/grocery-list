import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SyncEngine, tokenFromLocation } from './sync/index.js';
import { AddBar } from './ui/AddBar.js';
import { InstallHelp, shouldPromptInstall } from './ui/InstallHelp.js';
import { ItemList } from './ui/ItemList.js';
import { pointManifestAtHousehold } from './ui/manifest.js';
import { Landing } from './ui/Landing.js';
import { SyncStatus } from './ui/SyncStatus.js';

export function App() {
  const token = tokenFromLocation(window.location.pathname);
  return token ? <List token={token} /> : <Landing />;
}

function List({ token }: { token: string }) {
  const engine = useMemo(() => new SyncEngine(token), [token]);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [showHelp, setShowHelp] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(
    () => localStorage.getItem('grocery-list:install-dismissed') === '1',
  );

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  // Do this before the user can reach the Share sheet, so Add to Home Screen captures
  // this list rather than the landing page.
  useEffect(() => pointManifestAtHousehold(token), [token]);

  // Re-render on a timer so "Synced 2m ago" doesn't sit there going stale while the
  // screen is otherwise idle -- a status line that lies about its own age is still lying.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const showBanner = !dismissedBanner && shouldPromptInstall();
  const checkedCount = snapshot.items.filter((item) => item.checked).length;

  return (
    <div className="app">
      <header className="header">
        <h1 className="header__title">Groceries</h1>
        <button
          className="header__help"
          type="button"
          onClick={() => setShowHelp((open) => !open)}
          aria-label="How to add this to your home screen"
          aria-expanded={showHelp}
        >
          ?
        </button>
        <SyncStatus snapshot={snapshot} />
      </header>

      {showBanner && (
        <InstallHelp
          onDismiss={() => {
            localStorage.setItem('grocery-list:install-dismissed', '1');
            setDismissedBanner(true);
          }}
        />
      )}
      {showHelp && <InstallHelp />}

      <AddBar onAdd={(name) => engine.addItem(name)} />

      {snapshot.loaded ? (
        <ItemList
          items={snapshot.items}
          onToggle={(id, checked) => engine.setChecked(id, checked)}
          onRename={(id, name) => engine.rename(id, name)}
          onRemove={(id) => engine.remove(id)}
        />
      ) : (
        <p className="empty">Loading…</p>
      )}

      {checkedCount > 0 && (
        <button className="clear" type="button" onClick={() => engine.clearChecked()}>
          Clear {checkedCount} checked
        </button>
      )}
    </div>
  );
}
