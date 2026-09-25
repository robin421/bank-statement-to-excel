import { describe, expect, it } from 'vitest';
import { flagMismatches, reconcileBalances } from '../src/lib/parse/reconcile';

describe('flagMismatches', () => {
  it('marks only the rows that break the running-balance chain', () => {
    const amounts = [0, -50, 100, -25, 10];
    // Row 2 prints a balance 100.00 too high, which also breaks row 3's link.
    const balances = [1000, 950, 1150, 1025, 1035];
    const report = reconcileBalances(amounts, balances);
    const rows = amounts.map(() => ({ flags: [] as string[] }));

    flagMismatches(rows, report);
    flagMismatches(rows, report); // idempotent

    expect(report.mismatches.map((m) => m.index)).toEqual([2, 3]);
    expect(rows.map((row) => row.flags)).toEqual([[], [], ['balance-mismatch'], ['balance-mismatch'], []]);
  });
});
