/**
 * Real <lastmod> values for the sitemap, taken from git history.
 *
 * A URL's lastmod is the committer date of the last commit that touched the
 * page's source file under src/pages/. Returns undefined when that is not
 * knowable — dynamic routes, a shallow clone (every file would report the same
 * HEAD date, which is a lie), or git being unavailable — so the sitemap simply
 * omits the tag instead of inventing one.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PAGES = path.resolve('src/pages');
const EXTS = ['.astro', '.md', '.mdx'];

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const usable = git(['rev-parse', '--is-shallow-repository']) === 'false';
const cache = new Map();

function sourceFor(pathname) {
  const rel = pathname.replace(/^\/+|\/+$/g, '');
  const candidates = rel === '' ? ['index'] : [rel, `${rel}/index`];
  for (const base of candidates) {
    for (const ext of EXTS) {
      const file = path.join(PAGES, base + ext);
      if (fs.existsSync(file)) return file;
    }
  }
  return undefined;
}

export function lastmodForUrl(url) {
  if (!usable) return undefined;
  const { pathname } = new URL(url);
  if (cache.has(pathname)) return cache.get(pathname);
  const file = sourceFor(pathname);
  const iso = file ? git(['log', '-1', '--format=%cI', '--', file]) : '';
  const value = iso ? new Date(iso).toISOString() : undefined;
  cache.set(pathname, value);
  return value;
}
