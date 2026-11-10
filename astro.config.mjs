// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { lastmodForUrl } from './scripts/sitemap-lastmod.mjs';

/**
 * Resolve the canonical origin at config time.
 *
 * `loadEnv` reads `.env` files the same way Vite does, which `process.env` alone
 * does not. Buying a domain later is therefore a one-line change to `.env` (or
 * to the hosting environment) with nothing else in the codebase to update.
 */
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');
const siteUrl = String(process.env.PUBLIC_SITE_URL || env.PUBLIC_SITE_URL || 'https://www.wattflow.net').replace(
  /\/$/,
  '',
);

export default defineConfig({
  site: siteUrl,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    react(),
    // English-only since the 2026-11-10 pivot to tax calculators, so no
    // hreflang alternates. Retired converter pages are simply not built, and
    // public/_redirects 301s them (src/data/pivot-redirects.mjs).
    sitemap({
      // <lastmod> = date of the last git commit that touched the page's source
      // file. Omitted (rather than faked) when it cannot be known: shallow
      // clones, dynamic routes, or no git at all.
      serialize(item) {
        const lastmod = lastmodForUrl(item.url);
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    worker: { format: 'es' },
  },
});
