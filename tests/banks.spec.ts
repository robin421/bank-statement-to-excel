import { describe, expect, it } from 'vitest';
import {
  BANKS,
  PUBLISH_RECONCILE_FLOOR,
  findBank,
  isVerified,
  pendingBanks,
  verifiedBanks,
  type Bank,
  type VerificationRecord,
} from '../src/data/banks';

/**
 * The publishing gate.
 *
 * A bank page exists only with a real test behind it. These tests are the thing
 * that stops someone (including a future me) from filling the gap with a
 * templated page per bank, which is a doorway page by Google's definition and
 * would put the whole domain at risk for a handful of long-tail queries.
 */

function record(overrides: Partial<VerificationRecord> = {}): VerificationRecord {
  return {
    date: '2025-03-01',
    pages: 2,
    rows: 40,
    reconcileRate: 1,
    dateOrder: 'MDY',
    issues: [],
    ...overrides,
  };
}

function bank(verifications: VerificationRecord[]): Bank {
  return {
    slug: 'x',
    name: 'X',
    country: 'US',
    currency: 'USD',
    exportPath: '',
    layoutNotes: [],
    verifications,
  };
}

describe('publish gate', () => {
  it('refuses to publish a bank with no verification', () => {
    expect(isVerified(bank([]))).toBe(false);
  });

  it('publishes a bank that reconciled against its own balance', () => {
    expect(isVerified(bank([record()]))).toBe(true);
  });

  it('refuses a bank whose rows did not reconcile', () => {
    expect(isVerified(bank([record({ reconcileRate: PUBLISH_RECONCILE_FLOOR - 0.01 })]))).toBe(false);
  });

  it('refuses a bank tested on too few rows to mean anything', () => {
    expect(isVerified(bank([record({ rows: 2 })]))).toBe(false);
  });

  it('refuses a bank with multiple unresolved problems', () => {
    expect(isVerified(bank([record({ issues: ['a', 'b'] })]))).toBe(false);
    // One known caveat is acceptable and is printed on the page.
    expect(isVerified(bank([record({ issues: ['a'] })]))).toBe(true);
  });

  it('accepts a bank where one test passed even if an earlier one did not', () => {
    expect(isVerified(bank([record({ reconcileRate: 0.4 }), record()]))).toBe(true);
  });
});

describe('bank dataset', () => {
  it('has unique slugs', () => {
    const slugs = BANKS.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps every untested layout note marked as a hypothesis', () => {
    // A note may only claim "confirmed" once a verification exists to back it.
    for (const entry of BANKS) {
      if (isVerified(entry)) continue;
      for (const note of entry.layoutNotes) {
        expect(note.state, `${entry.slug}: "${note.text}" claims ${note.state} with no test`).toBe('hypothesis');
      }
    }
  });

  it('gives every bank a non-empty export path so the page is useful even untested', () => {
    for (const entry of BANKS) {
      expect(entry.exportPath.length, `${entry.slug} has no export path`).toBeGreaterThan(10);
      expect(entry.name.length).toBeGreaterThan(1);
      expect(entry.currency).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('partitions into verified and pending', () => {
    expect(verifiedBanks().length + pendingBanks().length).toBe(BANKS.length);
  });

  it('currently publishes nothing, because nothing has been tested on a real statement', () => {
    // This is the honest state of the dataset. If it starts failing, either a
    // real verification was added (great — update the expectation) or someone
    // published a bank without evidence (fix the dataset, not this test).
    expect(verifiedBanks()).toHaveLength(0);
    expect(BANKS.length).toBeGreaterThanOrEqual(5);
  });

  it('finds a bank by slug and returns undefined otherwise', () => {
    expect(findBank('chase')?.name).toBe('Chase');
    expect(findBank('not-a-bank')).toBeUndefined();
  });
});
