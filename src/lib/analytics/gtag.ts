/**
 * Google Analytics 4 and AdSense, in standard mode.
 *
 * Both tags load on page view as soon as their id is configured: no banner, no
 * consent gate, no stored decision. This is the industry-standard setup, and it
 * is what the privacy policy describes.
 *
 * The product still promises that the statement never leaves the machine, so
 * `track()` keeps its own guard: events carry counts, booleans and preset names,
 * never anything read out of a statement. The gtag `config` call also strips the
 * query string from the reported page location.
 *
 * With neither a measurement id nor a publisher id configured — the default in
 * this repository — none of this runs: no script, no request.
 */

export const GA4_MEASUREMENT_ID = (import.meta.env.PUBLIC_GA4_ID ?? '').trim();

export const ADSENSE_CLIENT_ID = (import.meta.env.PUBLIC_ADSENSE_CLIENT ?? '').trim();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    /** Set once the tag has been injected, so tests can observe the load. */
    __analyticsLoaded?: boolean;
    /** Set once the AdSense library has been injected, for the same reason. */
    __adsenseLoaded?: boolean;
  }
}

let loaded = false;
let adsenseLoaded = false;

/**
 * Load Google Analytics 4. Called on page view; idempotent, so a second call
 * cannot inject the tag twice.
 */
export function loadAnalytics(): void {
  if (loaded || !GA4_MEASUREMENT_ID || typeof document === 'undefined') return;
  loaded = true;
  window.__analyticsLoaded = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  window.gtag('js', new Date());
  window.gtag('config', GA4_MEASUREMENT_ID, {
    // The statement is never sent, but there is no reason to send the full URL
    // either — query strings can carry things a visitor did not intend to share.
    page_location: `${window.location.origin}${window.location.pathname}`,
    anonymize_ip: true,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`;
  document.head.appendChild(script);
}

/**
 * Load the AdSense library. Called on page view; idempotent, so a second call
 * cannot inject the script twice.
 *
 * The ad slots render their `<ins>` markup as soon as a publisher id is set. The
 * slot's `(adsbygoogle = window.adsbygoogle || []).push({})` call queues an entry
 * until the library arrives, then replays it.
 */
export function loadAdsense(): void {
  if (adsenseLoaded || !ADSENSE_CLIENT_ID || typeof document === 'undefined') return;
  adsenseLoaded = true;
  window.__adsenseLoaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT_ID)}`;
  document.head.appendChild(script);
}

/**
 * Send a GA4 event.
 *
 * A no-op unless analytics was actually loaded, so event call sites do not need
 * to know whether analytics is configured.
 *
 * **Never pass anything derived from the statement.** Events carry counts, booleans
 * and preset names — `rows`, `pages`, `reconcile_rate`, `status`, `preset` — and
 * nothing else. No descriptions, no amounts, no dates, no balances, no file names.
 * The privacy policy states this, and `tests/analytics.spec.ts` enforces it.
 */
export function track(event: string, params: Record<string, string | number | boolean> = {}): void {
  if (!loaded || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', event, params);
}
