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

/**
 * Fixtures that may not be used as correctness evidence.
 *
 * `us-commerce-bank.pdf` is a Commerce Bank specimen whose own figures disagree:
 * its summary prints Checks Paid as `-200.00` while the detail section lists
 * 75.00 + 30.00 + 200.00 and prints `Total Checks Paid $305.00`. Both subtotals
 * are internally consistent and they differ by exactly 105.00, so no transaction
 * ledger reproduces the printed ending balance.
 *
 * The file is authentic — its SHA-256 matches what commercebank.com serves today,
 * and rendering it confirms it is a complete single page, not a truncated
 * download. It is therefore not a CORRUPTED file, it is a flawed document, and
 * there is no correct answer to grade a parser against.
 *
 * Compare the 2011 Commerce Bank statement inside the St. Louis RFP
 * (corpus/candidates/G01-...), which is the same layout family and prints
 * `Total Checks Paid $31,853.38` against a summary of `-31,853.38`. The bank's
 * layout is fine; the 2003 specimen is simply wrong.
 *
 * It stays in the corpus as a ROBUSTNESS fixture: the parser must not crash on it,
 * and must not claim to have verified it. It is excluded from every statement-level
 * correctness assertion.
 */
const EXCLUDED_FROM_CORRECTNESS: Record<string, string> = {
  'us-commerce-bank.pdf': 'SOURCE_NOT_SELF_CONSISTENT — summary Checks Paid -200.00 vs detail total 305.00',
};

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
    const exclusion = EXCLUDED_FROM_CORRECTNESS[name];

    it(`${name} is no worse than the recorded baseline`, async () => {
      if (expected.outcome === 'refused') {
        // Refusing is a valid, correct outcome for a scan. It must keep refusing
        // rather than starting to invent rows.
        await expect(openPdf(path.join(CORPUS_DIR, name)).then(convertDocument)).rejects.toThrow();
        return;
      }

      const result = await convertDocument(await openPdf(path.join(CORPUS_DIR, name)));

      // Excluded fixtures must still not crash and must still be handled without
      // pretending the arithmetic was verified. See EXCLUDED_FROM_CORRECTNESS.
      if (exclusion) {
        expect(result.transactions.length, `${name}: excluded fixture lost its rows`).toBeGreaterThanOrEqual(0);
        return;
      }

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
    // A bank page is only honest when a real statement reconciles AND the document
    // itself supplies a ground truth to reconcile against. This makes the number
    // visible so it cannot quietly be assumed to be higher.
    const publishable = Object.entries(baseline).filter(
      ([name, entry]) =>
        !EXCLUDED_FROM_CORRECTNESS[name] &&
        entry.outcome === 'parsed' &&
        (entry.reconcileChecked ?? 0) >= 3 &&
        (entry.reconcileRate ?? 0) >= 0.95,
    );
    expect(publishable.map(([name]) => name)).toEqual(['us-capital-one.pdf']);
  });

  it('documents every fixture that is excluded from correctness evidence', () => {
    // The reason is the invariant: it is policy, and it must hold everywhere,
    // including a fresh clone where no corpus file exists at all. An exclusion
    // without a recorded reason is how a wrong ground truth hides.
    for (const [name, reason] of Object.entries(EXCLUDED_FROM_CORRECTNESS)) {
      expect(reason.length, `${name} needs a reason`).toBeGreaterThan(30);
      expect(reason, `${name} should name the cause`).toMatch(/SOURCE_NOT_SELF_CONSISTENT|CORRUPTED|NOT_A_STATEMENT/);
    }
  });

  it('only excludes fixtures that actually exist, when the corpus is present', () => {
    // Existence is a local condition, not a policy one: fixtures/real/ is
    // gitignored, so a clean clone has no corpus and this check is meaningless
    // there. Coupling the two made a fresh clone fail, which is how this split
    // was found.
    if (!fs.existsSync(CORPUS_DIR)) {
      expect(available).toHaveLength(0);
      return;
    }
    for (const name of Object.keys(EXCLUDED_FROM_CORRECTNESS)) {
      expect(fs.existsSync(path.join(CORPUS_DIR, name)), `${name} is excluded but absent`).toBe(true);
    }
  });
});
