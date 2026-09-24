#!/usr/bin/env node
/**
 * Publish /sitemap.xml as a stable HTTP 200 urlset.
 *
 * @astrojs/sitemap (with i18n) emits sitemap-index.xml → sitemap-0.xml.
 * GSC and many bots still expect /sitemap.xml. Copy the urlset so both
 * /sitemap.xml and /sitemap-index.xml remain submitable; do not redirect.
 */
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const source = path.join(dist, 'sitemap-0.xml');
const dest = path.join(dist, 'sitemap.xml');

if (!fs.existsSync(source)) {
  console.error(`alias-sitemap: missing ${source}. Did astro build emit a sitemap?`);
  process.exit(1);
}

fs.copyFileSync(source, dest);
const bytes = fs.statSync(dest).size;
if (bytes < 64 || !fs.readFileSync(dest, 'utf8').includes('<urlset')) {
  console.error('alias-sitemap: copied file does not look like a urlset');
  process.exit(1);
}
console.log(`alias-sitemap: wrote ${path.relative(process.cwd(), dest)} (${bytes} bytes)`);
