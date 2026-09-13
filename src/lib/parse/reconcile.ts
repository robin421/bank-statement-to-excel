/**
 * Running-balance reconciliation.
 *
 * This is the reason the tool can be trusted rather than merely hoped at. A
 * bank statement is a self-checking document: `previous balance + amount` must
 * equal `balance` on every row. That single invariant lets us
 *
 *   1. decide which money column is the balance column,
 *   2. decide whether a debit is signed or unsigned,
 *   3. count the rows we failed to parse, instead of silently dropping them.
 *
 * Nothing else in the pipeline is allowed to overrule it.
 */

export interface ReconcileMismatch {
  index: number;
  previousBalance: number;
  expected: number;
  actual: number;
  delta: number;
}

export interface ReconcileReport {
  /** Consecutive pairs where both balances were known. */
  checked: number;
  matched: number;
  passRate: number;
  mismatches: ReconcileMismatch[];
  /** Rows whose amount sign was reversed to satisfy the invariant. */
  signCorrections: number;
}

export const BALANCE_TOLERANCE = 0.005;

export function balancesAgree(a: number, b: number, tolerance = BALANCE_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function reconcileBalances(
  amounts: number[],
  balances: Array<number | null>,
  tolerance = BALANCE_TOLERANCE,
): ReconcileReport {
  const mismatches: ReconcileMismatch[] = [];
  let checked = 0;
  let matched = 0;

  for (let index = 1; index < amounts.length; index += 1) {
    const previous = balances[index - 1];
    const current = balances[index];
    if (previous === null || current === null) continue;
    checked += 1;
    const expected = round2(previous + amounts[index]);
    if (balancesAgree(expected, current, tolerance)) matched += 1;
    else mismatches.push({ index, previousBalance: previous, expected, actual: current, delta: round2(current - previous) });
  }

  return {
    checked,
    matched,
    passRate: checked ? matched / checked : 0,
    mismatches,
    signCorrections: 0,
  };
}

/** Whether flipping this row's sign would satisfy the invariant. */
export function flippedSignSatisfies(previousBalance: number, amount: number, balance: number, tolerance = BALANCE_TOLERANCE): boolean {
  return balancesAgree(previousBalance - amount, balance, tolerance);
}

/**
 * How well a candidate column-role assignment explains the statement.
 * Measured only against rows whose flow we could read AND whose balance we know.
 * A statement with no balance column scores 0 here and is judged elsewhere.
 */
export function reconciliationScore(amounts: number[], balances: Array<number | null>): number {
  return reconcileBalances(amounts, balances).passRate;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
