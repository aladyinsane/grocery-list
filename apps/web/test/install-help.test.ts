/**
 * The "?" button used to show "Add to Home Screen" steps even after the app was already
 * on the home screen -- explaining a feature that had already happened, which is exactly
 * the "needs explaining" smell principle 3 rules out. This is the boundary that decides
 * which content is correct, so it's worth pinning down without a phone in hand.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InstallHelp, shouldPromptInstall } from '../src/ui/InstallHelp.js';

function stubEnvironment(opts: {
  standalone?: boolean;
  matchesStandaloneMedia?: boolean;
  userAgent?: string;
}): void {
  const navigator = { standalone: opts.standalone, userAgent: opts.userAgent ?? 'iPhone' };
  const matchMedia = (query: string) => ({
    matches: query === '(display-mode: standalone)' && Boolean(opts.matchesStandaloneMedia),
  });
  vi.stubGlobal('navigator', navigator);
  vi.stubGlobal('window', { navigator, matchMedia });
}

beforeEach(() => vi.unstubAllGlobals());

describe('deciding what the "?" button explains', () => {
  it('offers to install when running in a browser tab on iOS', () => {
    stubEnvironment({ userAgent: 'iPhone' });
    expect(shouldPromptInstall()).toBe(true);
    const html = renderToStaticMarkup(createElement(InstallHelp));
    expect(html).toContain('Put this on your home screen');
  });

  it('explains sharing instead once installed, per navigator.standalone', () => {
    stubEnvironment({ standalone: true });
    expect(shouldPromptInstall()).toBe(false);
    const html = renderToStaticMarkup(createElement(InstallHelp));
    expect(html).toContain('Sharing this list');
    // The sharing copy mentions "Add to Home Screen" too, in passing -- what it must not
    // do is lead with it, as though installing were still the thing to explain.
    expect(html).not.toContain('Put this on your home screen');
  });

  it('explains sharing instead once installed, per the standalone media query', () => {
    // navigator.standalone is Safari-only; the media query is the portable signal, and
    // either one alone has to be enough to know we're already installed.
    stubEnvironment({ matchesStandaloneMedia: true });
    expect(shouldPromptInstall()).toBe(false);
    const html = renderToStaticMarkup(createElement(InstallHelp));
    expect(html).toContain('Sharing this list');
  });

  it('does not offer to install on a non-iOS browser', () => {
    stubEnvironment({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    expect(shouldPromptInstall()).toBe(false);
  });
});
