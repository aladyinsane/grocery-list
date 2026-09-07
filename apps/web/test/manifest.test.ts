/**
 * The home screen icon has to launch the list, not the landing page.
 *
 * This was a real bug: the static manifest declared `start_url: "/"`, iOS honored it over
 * the page the user installed from, and every icon opened the "Create our list" screen.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pointManifestAtHousehold } from '../src/ui/manifest.js';

let link: { getAttribute: (name: string) => string | null; setAttribute: (n: string, v: string) => void };
let href: string | null;

function stubDocument(withLink: boolean): void {
  href = withLink ? '/manifest.webmanifest' : null;
  link = {
    getAttribute: () => href,
    setAttribute: (_name, value) => {
      href = value;
    },
  };
  vi.stubGlobal('document', { querySelector: () => (withLink ? link : null) });
}

beforeEach(() => vi.unstubAllGlobals());

describe('pointing the manifest at a household', () => {
  it('replaces the static manifest with the household one', () => {
    stubDocument(true);
    pointManifestAtHousehold('abc123');
    expect(href).toBe('/h/abc123/manifest.webmanifest');
  });

  it('does not touch an href that is already correct', () => {
    stubDocument(true);
    pointManifestAtHousehold('abc123');
    const spy = vi.fn();
    link.setAttribute = spy;
    // Re-assigning an unchanged href would make Safari refetch for nothing.
    pointManifestAtHousehold('abc123');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing when the page has no manifest link', () => {
    stubDocument(false);
    expect(() => pointManifestAtHousehold('abc123')).not.toThrow();
  });
});
