import type { ReconciledChain } from '../decode';
import type { LineEvent } from '../lines';
import { chainEvidence, DEFAULT_EVIDENCE_WEIGHTS, type ChainEvidence, type EvidenceWeights } from './evidence';

/**
 * Chain selection — the statement-level judgement.
 *
 * `reconciled` and `verified` are different claims, and conflating them was the
 * previous stage's mistake:
 *
 *   reconciled  these figures form an arithmetically consistent chain
 *   verified    ...and this is the chain the user wants, with no materially
 *               competitive alternative
 *
 * A statement can hold several reconciled chains. Commerce Bank's sample holds a
 * summary chain that balances exactly and a transaction ledger, and both are
 * internally consistent financial explanations. Only one of them is the answer to
 * "convert my statement to Excel".
 *
 * So selection never re-uses arithmetic. Every candidate here already reconciles;
 * scoring it again on arithmetic would just let the cleanest summary win.
 */

export type SelectionReason =
  | 'CLEAR_DETAIL_CHAIN'
  | 'AMBIGUOUS_RECONCILED_CHAINS'
  | 'INSUFFICIENT_DETAIL_EVIDENCE'
  | 'NO_RECONCILED_CHAIN';

export interface ScoredChain {
  chain: ReconciledChain;
  evidence: ChainEvidence;
}

export interface ChainSelectionResult {
  status: 'verified' | 'partial';
  selected?: ReconciledChain;
  /** Every reconciled chain considered, best first. Retained so a caller can show them. */
  candidateChains: ScoredChain[];
  scoreGap: number;
  reason: SelectionReason;
  thresholds: {
    minDetailScore: number;
    minChainScoreGap: number;
  };
}

export interface SelectionOptions {
  /**
   * A chain below this shows no structural sign of being transaction detail.
   *
   * Provisional, and frozen before blind evaluation. Chosen so that a chain whose
   * amounts are all undated and few in number falls short (0 + 0 + 0.15·k), while
   * one with even partial date coverage clears it.
   */
  minDetailScore?: number;
  /**
   * How far ahead the best chain must be before the choice is called.
   *
   * Deliberately generous: returning `partial` costs the user a decision, while a
   * confident wrong answer costs them their books. The asymmetry is the whole
   * point of the fail-closed rule.
   */
  minChainScoreGap?: number;
  weights?: EvidenceWeights;
}

export const DEFAULT_MIN_DETAIL_SCORE = 0.35;
export const DEFAULT_MIN_CHAIN_SCORE_GAP = 0.15;

/**
 * Choose the chain that represents transaction detail.
 *
 * Ordering is by `detailScore`; arithmetic appears nowhere in the comparison.
 * Ties are broken by the lower chain id so the result is deterministic — a parser
 * that returns different answers for the same document cannot be tested.
 */
export function selectChain(
  chains: ReconciledChain[],
  lines: LineEvent[],
  options: SelectionOptions = {},
): ChainSelectionResult {
  const minDetailScore = options.minDetailScore ?? DEFAULT_MIN_DETAIL_SCORE;
  const minChainScoreGap = options.minChainScoreGap ?? DEFAULT_MIN_CHAIN_SCORE_GAP;
  const weights = options.weights ?? DEFAULT_EVIDENCE_WEIGHTS;

  // Only chains that actually reconciled are eligible. This is the gate: a chain
  // that failed its own arithmetic is not a candidate, however dated it looks.
  const reconciled = chains.filter(
    (chain) => chain.constraints.length > 0 && chain.constraints.every((constraint) => constraint.passed),
  );

  const scored: ScoredChain[] = reconciled
    .map((chain) => ({ chain, evidence: chainEvidence(chain, lines, weights) }))
    .sort((a, b) => b.evidence.detailScore - a.evidence.detailScore || a.chain.id.localeCompare(b.chain.id));

  const thresholds = { minDetailScore, minChainScoreGap };

  if (!scored.length) {
    return { status: 'partial', candidateChains: [], scoreGap: 0, reason: 'NO_RECONCILED_CHAIN', thresholds };
  }

  const best = scored[0];
  const second = scored[1];
  const scoreGap = second ? best.evidence.detailScore - second.evidence.detailScore : Number.POSITIVE_INFINITY;

  if (best.evidence.detailScore < minDetailScore) {
    // Nothing here looks like transaction detail. Reporting the best of a bad set
    // would be a silent wrong answer.
    return {
      status: 'partial',
      candidateChains: scored,
      scoreGap: Number.isFinite(scoreGap) ? scoreGap : 0,
      reason: 'INSUFFICIENT_DETAIL_EVIDENCE',
      thresholds,
    };
  }

  if (second && scoreGap < minChainScoreGap) {
    // Two chains explain the document about equally well on the evidence
    // available. The parser does not get to pick.
    return { status: 'partial', candidateChains: scored, scoreGap, reason: 'AMBIGUOUS_RECONCILED_CHAINS', thresholds };
  }

  return {
    status: 'verified',
    selected: best.chain,
    candidateChains: scored,
    scoreGap: Number.isFinite(scoreGap) ? scoreGap : 0,
    reason: 'CLEAR_DETAIL_CHAIN',
    thresholds,
  };
}
