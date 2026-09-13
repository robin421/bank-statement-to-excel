// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

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
  integrations: [react(), sitemap()],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    worker: { format: 'es' },
  },
});
