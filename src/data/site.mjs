// Central site config. Kept as .mjs so astro.config.mjs can import it too.
//
// Buying the domain later is a one-line change here plus PUBLIC_SITE_URL in the
// hosting env; nothing else in the codebase hardcodes an origin.
//
// `import.meta.env` is what Vite populates from `.env` and from the real
// environment; `process.env` is the fallback for plain Node contexts. Reading
// both means the site URL behaves the same in `astro dev`, `astro build` and CI.

const FALLBACK_URL = 'https://www.wattflow.net';

const fromEnv =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PUBLIC_SITE_URL) ||
  (typeof process !== 'undefined' ? process.env.PUBLIC_SITE_URL : undefined) ||
  FALLBACK_URL;

export const SITE_URL = String(fromEnv).replace(/\/$/, '');

export const SITE = {
  name: 'StatementToExcel',
  url: SITE_URL,
  tagline: 'Convert a bank statement PDF to Excel or CSV — in your browser',
  description:
    'Free tool that converts text-based bank statement PDFs into Excel (.xlsx) or CSV. Runs entirely in your browser — your statement is never uploaded. Includes QuickBooks and Xero export presets.',
  // TODO: point this at a real mailbox before applying to AdSense — a contact
  // address on a reserved TLD reaches nobody, and reviewers do check.
  email: 'hello@wattflow.net',
  twitter: '',
};
