/**
 * Point the page's manifest at this household's list.
 *
 * iOS launches a home screen icon at the manifest's `start_url`, not at the page the user
 * installed from. Left alone, every icon opens the landing page — and an installed iOS web
 * app has a storage jar separate from Safari's, so it cannot recover the token from
 * `localStorage` either. The launch URL is the only carrier, which is what ADR-0004
 * assumed all along.
 *
 * This runs on the client rather than being rewritten server-side on purpose: once the
 * service worker is installed it serves the cached `index.html` for navigations, so any
 * server-side edit to that HTML would stop reaching the browser. Mutating the DOM works
 * whichever way the page arrived.
 */
export function pointManifestAtHousehold(token: string): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) return;
  const href = `/h/${token}/manifest.webmanifest`;
  // Re-assigning an unchanged href would make Safari refetch for nothing.
  if (!link.getAttribute('href')?.endsWith(href)) link.setAttribute('href', href);
}
