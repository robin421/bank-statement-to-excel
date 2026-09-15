/**
 * Analytics, and the consent that gates it.
 *
 * The whole product is positioned on "your statement never leaves your machine",
 * and there is a browser test that enforces it. So analytics is built to a stricter
 * rule than the usual: **nothing loads until the visitor accepts.**
 *
 * The common alternative is Google Consent Mode with `analytics_storage: denied` by
 * default, which still sends cookieless pings before consent. That is compliant, and
 * it is the right choice for sites that need conversion modelling. It is the wrong
 * choice here, because it would mean the page makes third-party requests before
 * anyone agreed to them while the same page tells the visitor it does not.
 *
 * Consent is stored in `localStorage`, not a cookie, so the choice itself does not
 * create the thing it is asking about.
 *
 * With no measurement id configured — the default in this repository — none of this
 * runs: no script, no banner, no request.
 */

export const GA4_MEASUREMENT_ID = (import.meta.env.PUBLIC_GA4_ID ?? '').trim();

export const CONSENT_STORAGE_KEY = 'analytics-consent';

export type ConsentChoice = 'granted' | 'denied' | null;

export function readConsent(): ConsentChoice {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === 'granted' || stored === 'denied' ? stored : null;
  } catch {
    // Private mode, or storage disabled. Treat as undecided, never as consent.
    return null;
  }
}

export function writeConsent(choice: Exclude<ConsentChoice, null>): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // Failing to persist means the visitor is asked again next visit. Acceptable.
  }
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    /**
     * Set once the tag has been injected. Exposed so the browser smoke test can
     * assert that consenting actually loaded analytics, rather than only asserting
     * that nothing loaded before consent.
     */
    __analyticsLoaded?: boolean;
  }
}

let loaded = false;

/**
 * Load Google Analytics 4. Only ever called after explicit consent.
 * Idempotent, so a double accept cannot inject the tag twice.
 */
export function loadAnalytics(): void {
  if (loaded || !GA4_MEASUREMENT_ID || typeof document === 'undefined') return;
  loaded = true;
  window.__analyticsLoaded = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };

  window.gtag('consent', 'update', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
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

export function hasConsent(): boolean {
  return readConsent() === 'granted';
}

/**
 * Send a GA4 event.
 *
 * A no-op unless analytics was actually loaded, so event call sites do not need to
 * know whether analytics is configured or consented to.
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
