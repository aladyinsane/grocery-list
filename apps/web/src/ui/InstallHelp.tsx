/**
 * What to do next -- tailored to whether this is a browser tab or the installed app.
 *
 * Safari never prompts to install, so a user who doesn't do it gets a worse app in a
 * browser tab and no idea a better one was one tap away -- the discoverability cliff
 * ADR-0002 accepted. The banner closes the gap on first visit; the same content stays
 * behind "?" so nobody can get permanently stuck.
 *
 * Once installed there's nothing left to explain about installing it, but the "?" is
 * still there -- so past that point it answers the only thing left to ask: how to hand
 * this list to someone else. Getting this wrong (showing install steps to someone who
 * already installed it) is exactly the kind of "explains a feature that isn't there"
 * confusion principle 3 rules out.
 */

export function InstallHelp({ onDismiss }: { onDismiss?: () => void }) {
  return isStandalone() ? (
    <ShareHelp onDismiss={onDismiss} />
  ) : (
    <AddToHomeScreenHelp onDismiss={onDismiss} />
  );
}

function AddToHomeScreenHelp({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="install">
      <p className="install__lead">Put this on your home screen</p>
      <ol className="install__steps">
        <li>
          Tap <strong>•••</strong> at the bottom right of the screen.
        </li>
        <li>
          Tap <strong>Share</strong>.
        </li>
        <li>
          Tap <strong>Add to Home Screen</strong>. If you don’t see it, tap{' '}
          <strong>More</strong> first.
        </li>
        <li>
          Tap <strong>Add</strong>, top right.
        </li>
      </ol>
      <p className="install__note">
        Then open it from the icon on your home screen. You’ll never have to sign in, and
        it works in the shop even with no signal.
      </p>
      {onDismiss && (
        <button className="install__dismiss" type="button" onClick={onDismiss}>
          Got it
        </button>
      )}
    </div>
  );
}

function ShareHelp({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="install">
      <p className="install__lead">Sharing this list</p>
      <p className="install__note">
        This icon <em>is</em> the list — there’s no separate login. To put it on someone
        else’s phone, send them the link:
      </p>
      <ol className="install__steps">
        <li>
          Press and hold the <strong>Groceries</strong> icon on your home screen.
        </li>
        <li>
          Tap <strong>Share Bookmark</strong>.
        </li>
        <li>Send it however you’d normally send a link.</li>
      </ol>
      <p className="install__note">
        They open it, then do the same “Add to Home Screen” step you did — and from then
        on, everything either of you adds shows up on both phones.
      </p>
      {onDismiss && (
        <button className="install__dismiss" type="button" onClick={onDismiss}>
          Got it
        </button>
      )}
    </div>
  );
}

/** True when running as the installed home-screen app rather than a browser tab. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window.navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

/** True when we're in a browser tab on iOS rather than the installed app. */
export function shouldPromptInstall(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandalone()) return false;
  return /iPhone|iPad|iPod/.test(window.navigator.userAgent);
}
