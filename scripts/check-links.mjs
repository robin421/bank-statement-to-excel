#!/usr/bin/env node
/**
 * Internal link checker.
 *
 * Reads the built site and verifies that every internal href resolves to a page
 * we actually generated. Two failure modes are treated as errors, because both
 * waste crawl budget on a new domain:
 *
 *   1. a link to a page that does not exist (404)
 *   2. a link that only works via a redirect, i.e. missing the trailing slash
 *      that the canonical URL uses
 *
 *   node scripts/check-links.mjs [distDir]
 */
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');

if (!fs.existsSync(dist)) {
  console.error(`No build output at ${dist}. Run \`npm run build\` first.`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('._') || entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const pages = walk(dist);

/** Every URL the site can serve without a redirect. */
const served = new Set();
for (const file of pages) {
  const rel = `/${path.relative(dist, file)}`;
  served.add(rel);
  if (rel.endsWith('/index.html')) served.add(rel.slice(0, -'index.html'.length));
}
for (const file of walk0(dist)) {
  served.add(`/${path.relative(dist, file)}`);
}

function walk0(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('._') || entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk0(full, out);
    else if (!entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const HREF = /(?:href|src)="([^"]+)"/g;

/** path -> set of pages that link to it, for a readable report. */
const broken = new Map();
const redirectOnly = new Map();
let linkCount = 0;

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const from = `/${path.relative(dist, file).replace(/index\.html$/, '')}`;

  for (const match of html.matchAll(HREF)) {
    const href = match[1];
    if (/^(https?:|mailto:|tel:|data:|blob:|#|javascript:)/i.test(href)) continue;
    // Ignore anything pointing at another origin.
    if (href.startsWith('//')) continue;

    linkCount += 1;
    const target = href.split('#')[0].split('?')[0];
    if (!target.startsWith('/')) continue;

    // A directory URL must end in a slash, or it 308s before it resolves.
    const withSlash = target.endsWith('/') ? target : `${target}/`;
    if (served.has(target) || served.has(withSlash)) {
      if (!target.endsWith('/') && served.has(withSlash)) {
        if (!redirectOnly.has(target)) redirectOnly.set(target, new Set());
        redirectOnly.get(target).add(from);
      }
      continue;
    }

    if (!broken.has(target)) broken.set(target, new Set());
    broken.get(target).add(from);
  }
}

function report(title, map) {
  if (!map.size) return;
  console.log(`\n${title}`);
  for (const [target, sources] of [...map].sort()) {
    const where = [...sources].slice(0, 3).join(', ');
    console.log(`  ${target}`);
    console.log(`     linked from: ${where}${sources.size > 3 ? ` (+${sources.size - 3} more)` : ''}`);
  }
}

console.log(`checked ${linkCount} internal links across ${pages.length} pages`);
report('BROKEN LINKS (404):', broken);
report('REDIRECT-ONLY LINKS (missing trailing slash):', redirectOnly);

if (broken.size || redirectOnly.size) {
  console.log(`\n${broken.size} broken, ${redirectOnly.size} redirect-only`);
  process.exit(1);
}
console.log('\nall internal links resolve without a redirect');
