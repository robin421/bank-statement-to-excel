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
  /** Default social preview image (1200x630) in public/. */
  ogImage: '/og.png',
  ogImageAlt: 'StatementToExcel: bank statement PDF to Excel/CSV, in your browser',
  /**
   * "Featured on" directory badges shown in every page footer (nothing renders
   * when the list is empty).
   * Each entry is a directory's embed snippet as raw HTML, rendered verbatim.
   * Add the image host to img-src in vercel.json's CSP when adding one.
   */
  featuredBadges: [
    // Verbatim embed snippets from each directory (Fazier, Twelve Tools, Startup Fame).
    // Their free tiers verify by finding this exact markup, so don't reformat.
    '<a href="https://fazier.com" target="_blank"><img src="https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=featured&theme=light" alt="Fazier badge" /></a>',
    '<a href="https://twelve.tools" target="_blank"><img src="https://twelve.tools/badge0-white.svg" alt="Featured&#0032;on&#0032;Twelve&#0032;Tools" width="200" height="54"></a>',
    '<a href="https://startupfa.me/s/statementtoexcel?utm_source=www.wattflow.net" target="_blank"><img src="https://startupfa.me/badges/featured-badge.webp" alt="StatementToExcel - Featured on Startup Fame" width="171" height="54" /></a>',
  ],
};
