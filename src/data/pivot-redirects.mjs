// Bank-statement-converter URLs retired on 2026-11-10, when www.wattflow.net
// became a US "no tax on tips / overtime" calculator site. Each old URL is sent
// with a permanent redirect to the closest calculator page. None of them was
// about tips, so they all go to the overtime calculator (the site's main page
// by search volume). The homepage keeps its URL and is not listed here.
//
// Consumed by scripts/gen-legacy-redirects.mjs, which writes public/_redirects
// and vercel.json. Never list a path this site still builds — the --check step
// fails the build if you do.

export const PIVOT_TARGET = '/no-tax-on-overtime-calculator/';

/** Old bank-statement pages → new target. `from` has no trailing slash. */
export const PIVOT_REDIRECTS = {
  '/bank-statement-to-csv': PIVOT_TARGET,
  '/pdf-bank-statement-to-excel': PIVOT_TARGET,
  '/quickbooks-csv': PIVOT_TARGET,
  '/xero-csv': PIVOT_TARGET,
  '/ofx-qfx-to-csv': PIVOT_TARGET,
  '/extract-transactions': PIVOT_TARGET,
  '/scanned': PIVOT_TARGET,
  '/banks': PIVOT_TARGET,
  '/banks/chase': PIVOT_TARGET,
  '/banks/bank-of-america': PIVOT_TARGET,
  '/banks/wells-fargo': PIVOT_TARGET,
  '/banks/hdfc': PIVOT_TARGET,
  '/banks/icici': PIVOT_TARGET,
  '/banks/hsbc': PIVOT_TARGET,
  '/banks/barclays': PIVOT_TARGET,
  // Localised homepages of the converter (the tax site is English-only).
  '/de': PIVOT_TARGET,
  '/es': PIVOT_TARGET,
  '/fr': PIVOT_TARGET,
  '/pt': PIVOT_TARGET,
  '/hi': PIVOT_TARGET,
  // Converter guides.
  '/blog/how-to-convert-bank-statement-to-excel': PIVOT_TARGET,
  '/blog/excel-from-pdf-bank-statement': PIVOT_TARGET,
};

/** Splats for anything else under a retired section. Kept after every static rule. */
export const PIVOT_SPLATS = {
  '/banks/*': PIVOT_TARGET,
  '/de/*': PIVOT_TARGET,
  '/es/*': PIVOT_TARGET,
  '/fr/*': PIVOT_TARGET,
  '/pt/*': PIVOT_TARGET,
  '/hi/*': PIVOT_TARGET,
};
