import type { Transaction } from '../../src/lib/parse/transactions';

export interface ExpectedTransaction {
  date: string;
  description: string;
  amount: number;
  balance: number;
}

export interface Comparison {
  expected: number;
  parsed: number;
  matched: number;
  recall: number;
  precision: number;
  missing: ExpectedTransaction[];
  extra: Transaction[];
  amountMismatches: Array<{ expected: ExpectedTransaction; got: Transaction; delta: number }>;
}

const TOLERANCE = 0.011;

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

function normaliseWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Expected description must be contained in the parsed one, not the reverse. */
function descriptionCovers(expected: string, got: string): boolean {
  const gotWords = new Set(normaliseWords(got));
  const expectedWords = normaliseWords(expected);
  if (!expectedWords.length) return true;
  return expectedWords.every((word) => gotWords.has(word));
}

/**
 * Greedy alignment of parsed rows against ground truth.
 * Rows are matched on amount first (the thing that must not be wrong) and then
 * on date, because a misread day/month order is less harmful than a wrong
 * number and should be reported separately rather than as a missing row.
 */
export function compare(expected: ExpectedTransaction[], parsed: Transaction[]): Comparison {
  const remaining = parsed.map((transaction, index) => ({ transaction, index }));
  const missing: ExpectedTransaction[] = [];
  const amountMismatches: Comparison['amountMismatches'] = [];
  let matched = 0;

  for (const want of expected) {
    const amountHit = remaining.find(
      (candidate) => candidate.transaction.amount !== 0 && sameAmount(candidate.transaction.amount, want.amount),
    );
    const dateHit = remaining.find(
      (candidate) =>
        candidate.transaction.date === want.date &&
        candidate.transaction.balance !== null &&
        sameAmount(candidate.transaction.balance, want.balance),
    );
    const hit = amountHit ?? dateHit;

    if (!hit) {
      const wrongAmount = remaining.find((candidate) => candidate.transaction.date === want.date);
      if (wrongAmount) {
        amountMismatches.push({
          expected: want,
          got: wrongAmount.transaction,
          delta: wrongAmount.transaction.amount - want.amount,
        });
        remaining.splice(remaining.indexOf(wrongAmount), 1);
        continue;
      }
      missing.push(want);
      continue;
    }

    remaining.splice(remaining.indexOf(hit), 1);
    matched += 1;
  }

  const extra = remaining.map((candidate) => candidate.transaction);
  const recall = expected.length ? matched / expected.length : 1;
  const precision = parsed.length ? matched / parsed.length : 0;

  return { expected: expected.length, parsed: parsed.length, matched, recall, precision, missing, extra, amountMismatches };
}

export function describeComparison(comparison: Comparison): string {
  const lines = [
    `  expected ${comparison.expected} rows, parsed ${comparison.parsed}, matched ${comparison.matched}`,
    `  recall ${(comparison.recall * 100).toFixed(1)}%  precision ${(comparison.precision * 100).toFixed(1)}%`,
  ];
  for (const want of comparison.missing.slice(0, 5)) {
    lines.push(`  missing: ${want.date} ${want.amount} ${want.description.slice(0, 40)}`);
  }
  for (const mismatch of comparison.amountMismatches.slice(0, 5)) {
    lines.push(`  amount: expected ${mismatch.expected.amount} got ${mismatch.got.amount} on ${mismatch.expected.date}`);
  }
  for (const got of comparison.extra.slice(0, 5)) {
    lines.push(`  extra: ${got.dateRaw} ${got.amount} ${got.description.slice(0, 40)}`);
  }
  return lines.join('\n');
}

export { descriptionCovers };
