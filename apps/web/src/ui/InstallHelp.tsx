/**
 * Add to Home Screen instructions.
 *
 * Safari never prompts for this, so a user who doesn't do it gets a worse app in a
 * browser tab and no idea that a better one was one tap away -- the discoverability cliff
 * ADR-0002 accepted. The banner closes the gap on first visit; the same content stays
 * behind "?" so nobody can get permanently stuck.
 */

export function InstallHelp({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="install">
      <p className="install__lead">Put this on your home screen</p>
      <ol className="install__steps">
        <li>
          Tap the <strong>Share</strong> button — the square with an arrow pointing up, at
          the bottom of the screen.
        </li>
        <li>
          Scroll down and tap <strong>Add to Home Screen</strong>.
        </li>
        <li>
          Tap <strong>Add</strong>.
        </li>
      </ol>
      <p className="install__note">
        Then open it from the icon. You’ll never have to sign in, and it works in the shop
        even with no signal.
      </p>
      {onDismiss && (
        <button className="install__dismiss" type="button" onClick={onDismiss}>
          Got it
        </button>
      )}
    </div>
  );
}

/** True when we're in a browser tab on iOS rather than the installed app. */
export function shouldPromptInstall(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone =
    (window.navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true;
  if (standalone) return false;
  return /iPhone|iPad|iPod/.test(window.navigator.userAgent);
}
