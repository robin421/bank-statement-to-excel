// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { LOCALE_CODES } from './src/i18n/locales.ts';

/**
 * Resolve the canonical origin at config time.
 *
 * `loadEnv` reads `.env` files the same way Vite does, which `process.env` alone
 * does not. Buying a domain later is therefore a one-line change to `.env` (or
 * to the hosting environment) with nothing else in the codebase to update.
 */
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), 'PUBLIC_');
const siteUrl = String(process.env.PUBLIC_SITE_URL || env.PUBLIC_SITE_URL || 'https://bankstatementtoexcel.example').replace(
  /\/$/,
  '',
);

export default defineConfig({
  site: siteUrl,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    react(),
    // Tell the sitemap about the language structure so it emits xhtml:link
    // alternates. `defaultLocale` has to appear in `locales` — the integration
    // only *strips* prefixes it knows, it never writes an /en/ URL, so English
    // stays at `/` while every other locale lives under `/<code>/`. Pages that
    // exist in one language only get no alternates, which is correct.
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: Object.fromEntries(LOCALE_CODES.map((code) => [code, code])),
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
