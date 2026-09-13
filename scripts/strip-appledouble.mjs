#!/usr/bin/env node
/**
 * Remove macOS AppleDouble sidecar files from the build output.
 *
 * This repo lives on a volume that writes `._name` companions for every file.
 * They are invisible in Finder, meaningless to a web server, and would be
 * uploaded to Cloudflare Pages as junk (and in some setups published). Strip
 * them before deploy rather than after something breaks.
 */
import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2);

if (!roots.length) {
  console.error('usage: node scripts/strip-appledouble.mjs <dir> [dir...]');
  process.exit(1);
}

let removed = 0;

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('._') || entry.name === '.DS_Store') {
      fs.rmSync(full, { force: true, recursive: true });
      removed += 1;
      continue;
    }
    if (entry.isDirectory()) walk(full);
  }
}

for (const root of roots) {
  if (fs.existsSync(root)) walk(root);
}

console.log(`stripped ${removed} macOS artifact${removed === 1 ? '' : 's'}`);
