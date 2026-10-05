import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Analytics guards.
 *
 * Wiring Google Analytics into a product whose entire claim is "your statement
 * never leaves your machine" creates one specific new risk: an event parameter that
 * quietly carries something read out of the statement. The privacy policy promises
 * that events contain counts, booleans and format names only, so that promise is
 * tested rather than trusted.
 *
 * The source scan below is the important one. It reads every `track(...)` call site
 * and fails on any parameter name that is not on an explicit allowlist, which means
 * adding `description: transaction.description` would fail the build rather than
 * silently ship.
 */

const ALLOWED_EVENT_PARAMS = new Set([
  'pages',
  'rows',
  'reconcile_rate',
  'quality',
  'source',
  'reason',
  'preset',
  'date_format',
  'export_locale',
]);

const ALLOWED_EVENTS = new Set([
  'statement_submitted',
  'statement_parsed',
  'statement_error',
  'export_download',
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('._') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|astro)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('analytics event call sites', () => {
  const files = sourceFiles('src').filter((file) => !file.includes(`lib${path.sep}analytics`));

  it('finds the funnel call sites', () => {
    const callSites = files.filter((file) => fs.readFileSync(file, 'utf8').includes('track('));
    expect(callSites.length, 'no track() call sites found — did the wiring disappear?').toBeGreaterThan(0);
  });

  it('only uses the documented event names', () => {
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\btrack\(\s*'([^']+)'/g)) {
        expect(ALLOWED_EVENTS.has(match[1]), `${file}: undocumented event "${match[1]}"`).toBe(true);
      }
    }
  });

  it('never sends a statement-derived parameter', () => {
    // The guard that matters: any parameter name that is not explicitly allowed is
    // a potential leak of file content into a third-party request.
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\btrack\(\s*'[^']+'\s*,\s*\{([^}]*)\}/g)) {
        const keys = [...match[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((key) => key[1]);
        for (const key of keys) {
          expect(ALLOWED_EVENT_PARAMS.has(key), `${file}: track() sends disallowed param "${key}"`).toBe(true);
        }
      }
    }
  });

  it('does not interpolate statement values into event names', () => {
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(/\btrack\(\s*`/.test(source), `${file} builds an event name from a template literal`).toBe(false);
    }
  });
});

describe('the tag loader', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function stubBrowser() {
    const appended: Array<{ src?: string; async?: boolean }> = [];
    const win: {
      location: { origin: string; pathname: string };
      dataLayer: unknown[];
      __analyticsLoaded?: boolean;
    } = {
      location: { origin: 'https://example.test', pathname: '/de/' },
      dataLayer: [],
    };
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', {
      head: { appendChild: (node: { src?: string }) => appended.push(node) },
      createElement: () => ({}),
    });
    return { appended, win };
  }

  it('does nothing when no measurement id is configured', async () => {
    const { appended } = stubBrowser();
    const { loadAnalytics, track } = await import('../src/lib/analytics/gtag');
    loadAnalytics();
    expect(appended).toHaveLength(0);
    // And the event helper must not throw when analytics was never loaded.
    expect(() => track('statement_submitted')).not.toThrow();
  });

  it('injects gtag.js immediately when a measurement id is configured', async () => {
    vi.stubEnv('PUBLIC_GA4_ID', 'G-TEST123456');
    vi.resetModules();
    const { appended, win } = stubBrowser();
    const { GA4_MEASUREMENT_ID, loadAnalytics } = await import('../src/lib/analytics/gtag');
    expect(GA4_MEASUREMENT_ID).toBe('G-TEST123456');

    loadAnalytics();

    expect(appended).toHaveLength(1);
    expect(appended[0].src).toContain('googletagmanager.com');
    expect(appended[0].src).toContain('id=G-TEST123456');
    expect(win.__analyticsLoaded).toBe(true);
  });

  it('is idempotent, so a second call injects the tag once', async () => {
    vi.stubEnv('PUBLIC_GA4_ID', 'G-TEST123456');
    vi.resetModules();
    const { appended } = stubBrowser();
    const { loadAnalytics } = await import('../src/lib/analytics/gtag');
    loadAnalytics();
    loadAnalytics();
    expect(appended).toHaveLength(1);
  });
});

describe('the ads loader', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function stubAdBrowser() {
    const appended: Array<{ src?: string; crossOrigin?: string }> = [];
    const win: { __adsenseLoaded?: boolean } = {};
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', {
      head: { appendChild: (node: { src?: string }) => appended.push(node) },
      createElement: () => ({}),
    });
    return { appended, win };
  }

  it('does nothing when no publisher id is configured', async () => {
    const { appended } = stubAdBrowser();
    const { loadAdsense } = await import('../src/lib/analytics/gtag');
    loadAdsense();
    expect(appended).toHaveLength(0);
  });

  it('loads the AdSense library when a publisher id is configured', async () => {
    vi.stubEnv('PUBLIC_ADSENSE_CLIENT', 'ca-pub-1234567890123456');
    vi.resetModules();
    const { appended, win } = stubAdBrowser();
    const { ADSENSE_CLIENT_ID, loadAdsense } = await import('../src/lib/analytics/gtag');
    expect(ADSENSE_CLIENT_ID).toBe('ca-pub-1234567890123456');

    loadAdsense();

    expect(appended).toHaveLength(1);
    expect(appended[0].src).toContain('pagead2.googlesyndication.com');
    expect(appended[0].src).toContain('client=ca-pub-1234567890123456');
    expect(win.__adsenseLoaded).toBe(true);
  });

  it('is idempotent, so a double call injects the library once', async () => {
    vi.stubEnv('PUBLIC_ADSENSE_CLIENT', 'ca-pub-1234567890123456');
    vi.resetModules();
    const { appended } = stubAdBrowser();
    const { loadAdsense } = await import('../src/lib/analytics/gtag');
    loadAdsense();
    loadAdsense();
    expect(appended).toHaveLength(1);
  });
});
