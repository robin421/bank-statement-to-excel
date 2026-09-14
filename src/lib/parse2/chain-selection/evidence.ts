import type { ReconciledChain } from '../decode';
import type { LineEvent, LineIndex } from '../lines';
import type { PdfToken } from '../tokens';

/**
 * Chain evidence: is this reconciled chain the transaction detail?
 *
 * The architecture this belongs to draws a line the earlier parser did not:
 *
 *   reconciliation  asks "is this a financially self-consistent explanation?"
 *   chain selection asks "is this the detail the user wants exported?"
 *
 * A chain that reconciles perfectly can still be the wrong answer. A Commerce
 * Bank sample holds a summary chain
 * (`7126.11 + 3615.08 − 20.00 − 200.00 = 10521.19`) that balances exactly and
 * contains no transactions at all. Reconciliation cannot tell the two apart, so it
 * must not be asked to.
 *
 * The evidence here is deliberately about *structure*, never about arithmetic —
 * every chain reaching this stage already reconciles, so rewarding arithmetic
 * again would simply let a clean summary outrank the ledger.
 */

export interface ChainEvidence {
  /** Amounts in the chain. */
  entryCount: number;
  /** How many of them carry a transaction date. */
  entriesWithTransactionDate: number;
  /** `entriesWithTransactionDate / entryCount`. */
  dateCoverage: number;
  /**
   * The same idea weighted by value: share of the chain's absolute amount value
   * that belongs to dated entries.
   *
   * Counting entries alone is fragile — a ledger padded with tiny undated
   * adjustment lines would be dragged down disproportionately — so the value
   * weighted form is reported alongside and carries most of the weight.
   */
  datedAmountCoverage: number;
  /** Passed through for diagnostics only. Never part of `detailScore`. */
  reconciliationScore: number;
  /** Not implemented yet; reserved for cross-chain subtotal structure. */
  structuralScore: number;
  /** The selection score. */
  detailScore: number;
}

export interface EvidenceWeights {
  dateCoverage: number;
  datedAmountCoverage: number;
  entryCount: number;
  /** Entry count saturates at this many entries. */
  entryCountSaturation: number;
}

/**
 * Weights, in the priority order the brief requires:
 *
 *   date coverage  >  dated amount coverage  >  entry count
 *
 * Entry count is last on purpose. "The ledger has more rows than the summary" is a
 * tendency, not an invariant: a statement can easily have eight summary categories
 * and four transactions. It is a tie-breaker, never a decider.
 */
export const DEFAULT_EVIDENCE_WEIGHTS: EvidenceWeights = {
  dateCoverage: 1,
  datedAmountCoverage: 0.6,
  entryCount: 0.15,
  entryCountSaturation: 10,
};

/**
 * How far back a date may sit and still belong to an amount.
 *
 * Two lines: enough for a date on the entry's first line with the amount on the
 * line below, and short enough not to reach a section header. Reaching further
 * made a `Statement period 01/01/2013 to 03/31/2013` line mark the first category
 * row of a summary block as dated, which is exactly the evidence that must not
 * exist for a summary to be mistaken for a ledger.
 */
export const DATE_LOOKBACK_LINES = 2;

/**
 * Is this amount part of a dated entry?
 *
 * Deliberately not `line.hasDate`: the date may sit on the entry's first line with
 * the amount below it, which is exactly how a multi-line entry prints. The scan
 * stops at the previous amount, because an amount starts a new entry and a date
 * above it belongs to that earlier entry, not this one.
 */
function amountIsDated(amountLineId: string, lines: LineEvent[]): boolean {
  const index = lines.findIndex((line) => line.id === amountLineId);
  if (index < 0) return false;
  if (lines[index].dateTokens.length > 0) return true;

  for (let back = 1; back <= DATE_LOOKBACK_LINES; back += 1) {
    const candidate = lines[index - back];
    if (!candidate) return false;
    // A previous amount means we have walked into the previous entry.
    if (candidate.money.length > 0) return false;
    if (candidate.dateTokens.length > 0) return true;
  }
  return false;
}

export function chainEvidence(
  chain: ReconciledChain,
  lines: LineEvent[],
  weights: EvidenceWeights = DEFAULT_EVIDENCE_WEIGHTS,
): ChainEvidence {
  const entryCount = chain.amounts.length;
  let entriesWithTransactionDate = 0;
  let datedValue = 0;
  let totalValue = 0;

  for (const amount of chain.amounts) {
    const magnitude = Math.abs(amount.value);
    totalValue += magnitude;
    if (amountIsDated(amount.lineId, lines)) {
      entriesWithTransactionDate += 1;
      datedValue += magnitude;
    }
  }

  const dateCoverage = entryCount ? entriesWithTransactionDate / entryCount : 0;
  const datedAmountCoverage = totalValue > 0 ? datedValue / totalValue : 0;

  const reconciliationScore =
    chain.constraints.length === 0
      ? 0
      : chain.constraints.filter((constraint) => constraint.passed).length / chain.constraints.length;

  // Normalised to 0..1 by the sum of weights, so `minDetailScore` is a fraction
  // and a diagnostic number means the same thing whatever the weights become.
  const weighted =
    weights.dateCoverage * dateCoverage +
    weights.datedAmountCoverage * datedAmountCoverage +
    weights.entryCount * Math.min(1, entryCount / weights.entryCountSaturation);
  const detailScore = weighted / (weights.dateCoverage + weights.datedAmountCoverage + weights.entryCount);

  return {
    entryCount,
    entriesWithTransactionDate,
    dateCoverage,
    datedAmountCoverage,
    reconciliationScore,
    structuralScore: 0,
    detailScore,
  };
}

/** True when any amount in the chain is dated. Used for diagnostics. */
export function chainHasAnyDate(chain: ReconciledChain, lines: LineEvent[]): boolean {
  return chain.amounts.some((amount) => amountIsDated(amount.lineId, lines));
}

export type { PdfToken, LineIndex };
