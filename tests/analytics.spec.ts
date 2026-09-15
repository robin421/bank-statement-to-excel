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

describe('consent state', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats an absent decision as undecided, never as consent', async () => {
    const { readConsent } = await import('../src/lib/analytics/gtag');
    expect(readConsent()).toBeNull();
  });

  it('round-trips a decision', async () => {
    const { readConsent, writeConsent } = await import('../src/lib/analytics/gtag');
    writeConsent('denied');
    expect(readConsent()).toBe('denied');
    writeConsent('granted');
    expect(readConsent()).toBe('granted');
  });

  it('ignores a corrupted stored value rather than guessing', async () => {
    store.set('analytics-consent', 'yes-please');
    const { readConsent, hasConsent } = await import('../src/lib/analytics/gtag');
    expect(readConsent()).toBeNull();
    expect(hasConsent()).toBe(false);
  });

  it('treats unavailable storage as undecided, not as consent', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('storage disabled');
        },
        setItem: () => {
          throw new Error('storage disabled');
        },
      },
    });
    vi.resetModules();
    const { readConsent, hasConsent } = await import('../src/lib/analytics/gtag');
    expect(readConsent()).toBeNull();
    expect(hasConsent()).toBe(false);
  });
});

describe('the tag loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function stubBrowser() {
    const appended: Array<{ src?: string }> = [];
    vi.stubGlobal('window', {
      location: { origin: 'https://example.test', pathname: '/de/' },
      dataLayer: [] as unknown[],
    });
    vi.stubGlobal('document', {
      head: { appendChild: (node: { src?: string }) => appended.push(node) },
      createElement: () => ({}),
    });
    return { appended };
  }

  it('does nothing when no measurement id is configured', async () => {
    const { appended } = stubBrowser();
    const { loadAnalytics, track } = await import('../src/lib/analytics/gtag');
    loadAnalytics();
    expect(appended).toHaveLength(0);
    // And the event helper must not throw when analytics was never loaded.
    expect(() => track('statement_submitted')).not.toThrow();
  });

  it('is inert before consent is granted, so nothing is sent by merely visiting', async () => {
    const { appended } = stubBrowser();
    const { track } = await import('../src/lib/analytics/gtag');
    track('statement_parsed', { rows: 42 });
    expect(appended).toHaveLength(0);
  });
});
