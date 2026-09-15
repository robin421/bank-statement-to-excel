import { GA4_MEASUREMENT_ID, loadAnalytics, readConsent, writeConsent } from './gtag';

/**
 * Browser entry point for the consent banner.
 *
 * Kept separate from `gtag.ts` so the analytics module stays free of DOM
 * assumptions and can be imported by tests. This file is the only place that
 * touches the banner element.
 *
 * Order of business:
 *   1. an existing decision is honoured immediately, and nothing is asked again
 *   2. an undecided visitor is asked, without the banner blocking the tool
 *   3. only an explicit Accept ever loads a third-party script
 */

function wireBanner(): void {
  const banner = document.getElementById('consent-banner');
  if (!banner) return;

  const stored = readConsent();

  if (stored === 'granted') {
    loadAnalytics();
    return;
  }
  if (stored === 'denied') {
    // Decided against. Nothing loads, ever, and we do not ask again.
    return;
  }

  banner.hidden = false;

  banner.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-consent]');
    if (!button) return;
    const choice = button.dataset.consent === 'granted' ? 'granted' : 'denied';
    writeConsent(choice);
    banner.hidden = true;
    if (choice === 'granted') loadAnalytics();
  });
}

if (GA4_MEASUREMENT_ID) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireBanner, { once: true });
  } else {
    wireBanner();
  }
}
