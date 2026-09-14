import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertDocument } from '../src/lib/parse';
import { openPdf } from './helpers/pdfjs';

/**
 * Regression guard for real statements.
 *
 * Why this exists: the synthetic corpus scored 100% while every real Sparkasse
 * and Postbank statement parsed to zero rows. A corpus you generate yourself
 * tests your assumptions, not the world. This one tests the world.
 *
 * The statements live in fixtures/real/ and are gitignored (third-party
 * documents), so the suite skips when they are absent. `fixtures/real-baseline.json`
 * IS committed: it records what the parser currently achieves, and this test
 * fails if a change makes any real statement worse.
 *
 * The baseline is a floor, not a target. It is deliberately low in places —
 * several of these layouts do not parse properly yet. Raise the numbers as the
 * parser improves; never lower them to make a build pass.
 */

interface BaselineEntry {
  outcome: 'parsed' | 'refused';
  pages?: number;
  rows?: number;
  reconcileRate?: number;
  reconcileChecked?: number;
  quality?: string;
  reason?: string;
}

const BASELINE_PATH = path.join(process.cwd(), 'fixtures', 'real-baseline.json');
const CORPUS_DIR = path.join(process.cwd(), 'fixtures', 'real');

const baseline: Record<string, BaselineEntry> = fs.existsSync(BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  : {};

const available = Object.keys(baseline).filter((name) => fs.existsSync(path.join(CORPUS_DIR, name)));
const missing = Object.keys(baseline).length - available.length;

describe('real statement corpus', () => {
  it('has a recorded baseline', () => {
    expect(Object.keys(baseline).length, 'fixtures/real-baseline.json is missing or empty').toBeGreaterThan(0);
  });

  it.runIf(missing > 0)('skips files that are not present locally', () => {
    // Not a failure: the corpus is third-party and not redistributable.
    console.info(`  ${missing} of ${Object.keys(baseline).length} statements not present locally — see README`);
    expect(available.length).toBeGreaterThanOrEqual(0);
  });

  for (const name of available) {
    const expected = baseline[name];

    it(`${name} is no worse than the recorded baseline`, async () => {
      if (expected.outcome === 'refused') {
        // Refusing is a valid, correct outcome for a scan. It must keep refusing
        // rather than starting to invent rows.
        await expect(openPdf(path.join(CORPUS_DIR, name)).then(convertDocument)).rejects.toThrow();
        return;
      }

      const result = await convertDocument(await openPdf(path.join(CORPUS_DIR, name)));

      // Rows may be found; they may not be lost.
      expect(result.transactions.length, `${name}: rows dropped`).toBeGreaterThanOrEqual(expected.rows ?? 0);

      // The balance chain may improve but not decay.
      if (expected.reconcileChecked) {
        expect(
          result.reconciliation.checked,
          `${name}: fewer rows checked against the balance than before`,
        ).toBeGreaterThanOrEqual(expected.reconcileChecked);
      }
      if ((expected.reconcileRate ?? 0) > 0) {
        expect(
          result.reconciliation.passRate,
          `${name}: balance reconciliation regressed`,
        ).toBeGreaterThanOrEqual((expected.reconcileRate ?? 0) - 0.001);
      }
    });
  }

  it('knows how many real statements are actually publishable', () => {
    // A bank page is only honest when a real statement reconciles. This makes
    // the number visible, so it cannot quietly be assumed to be higher.
    const publishable = Object.entries(baseline).filter(
      ([, entry]) =>
        entry.outcome === 'parsed' && (entry.reconcileChecked ?? 0) >= 3 && (entry.reconcileRate ?? 0) >= 0.95,
    );
    expect(publishable.map(([name]) => name)).toEqual(['us-capital-one.pdf']);
  });
});
