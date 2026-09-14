import type { PdfToken } from './tokens';
import type { MoneyCandidate } from './amounts';
import type { LineEvent } from './lines';

export type { LineEvent };

/**
 * Sparse balance constraint decoding.
 *
 * The experiment the rebuild rests on. The previous parser checked
 * `previous_balance + amount == balance` on *consecutive* rows, which requires a
 * balance on every row. Real statements often print a balance only at intervals —
 * a Sparkasse statement carries `Kontostand` at the start and the end and nowhere
 * between — so the check had nothing to work with exactly where it mattered.
 *
 * The general constraint is a sum over an interval:
 *
 *     B[j] - B[i]  ==  Σ  ±amount[k]      for i < k < j
 *
 * Two anchors anywhere in the document then constrain every amount between them,
 * and three things follow:
 *
 *   1. Sparse balances become usable instead of fatal.
 *   2. A summary row (`Deposits & Other Credits  +3,615.08`) cannot be admitted as
 *      a transaction, because including it breaks the sum. No keyword list: the
 *      arithmetic rejects it.
 *   3. An unsigned debit column has its sign settled by which assignment makes the
 *      sum work, rather than by which column it sits in.
 *
 * Two implementation properties make the search tractable, and both matter:
 *
 *   - States are parent-linked, not copied. Cloning the decision history per
 *     branch made a sixteen-amount gap cost 65536 array copies and forced the beam
 *     far below the size the search needs.
 *   - A constraint that does not hold may not be admitted at all. Permitting it at
 *     a penalty let the search buy one satisfied constraint by paying for a
 *     contradiction, which is how a wrong parse outscored the correct one.
 *   - Signs are only branched when the statement did not print one. `-790,00`
 *     already says negative; trying `+790,00` as well doubles the space for no
 *     information. This is reading evidence, not assuming a column convention.
 */

/** Money equality tolerance. Statements round to a cent. */
export const BALANCE_TOLERANCE = 0.011;
/** Weight of one satisfied balance constraint. Dominates every other term. */
const W_CONSTRAINT = 100;
/** Bonus per amount spanned: two anchors one row apart agree by accident far more easily than twenty rows apart. */
const W_SPAN = 0.8;
/** Cost of admitting a token as an amount. */
const W_AMOUNT_COST = 1.5;
/** Cost of leaving a money-looking token unexplained, scaled by its confidence. */
const W_UNEXPLAINED = 8;
/**
 * Cost of starting a new balance chain.
 *
 * A statement can contain several independent chains — Capital One's sample has a
 * savings summary at the top and the activity ledger below, each with its own
 * running balance. Starting a chain has to be possible, or the ledger cannot be
 * verified; it costs, so a parse does not fragment into single-row chains.
 */
const W_CHAIN_START = 4;
/** Default cap on live states. Bounded so a browser tab stays responsive. */
export const DEFAULT_MAX_STATES = 120_000;

export type Role = 'amount' | 'anchor' | 'ignored';

export interface DecodedAmount {
  token: PdfToken;
  /** Signed. */
  value: number;
  role: 'amount';
  lineId: string;
}

export interface BalanceConstraint {
  fromLine: string;
  toLine: string;
  fromValue: number;
  toValue: number;
  delta: number;
  computed: number;
  passed: boolean;
  /** How many amounts the constraint spans. Longer spans are stronger evidence. */
  spans: number;
}

export interface Parse {
  roles: Map<string, Role>;
  amounts: DecodedAmount[];
  anchors: Array<{ token: PdfToken; value: number; lineId: string }>;
  constraints: BalanceConstraint[];
  score: number;
  /** Objective terms, so a choice can be explained rather than merely asserted. */
  terms: {
    constraintScore: number;
    anchors: number;
    amounts: number;
    ignored: number;
    unexplained: number;
    contradictions: number;
  };
  /** Rejected readings of tokens on lines the parse consumed, for diagnostics. */
  rejected: Array<{ token: PdfToken; reason: string }>;
}

interface Decision {
  kind: 'skip' | 'amount' | 'anchor' | 'chain';
  token?: PdfToken;
  signedValue?: number;
  lineId?: string;
  constraint?: BalanceConstraint;
  unexplained?: number;
}

interface State {
  parent: State | null;
  decision: Decision | null;
  lastAnchor: number | null;
  runningSum: number;
  lastAnchorLine: string | null;
  span: number;
  score: number;
  constraintScore: number;
  unexplained: number;
  contradictions: number;
  anchors: number;
  amounts: number;
  chains: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Beam search over lines.
 *
 * States are merged on `(lastAnchor, runningSum)`: two parses that have reached
 * the same running balance from the same anchor are equivalent for every future
 * constraint, so keeping the better-scoring one loses nothing. That merge is what
 * keeps the search exact within the cap — the reachable sums between two anchors
 * are bounded by the number of sign assignments, not by the number of parses.
 */
export function decode(lines: LineEvent[], options: { maxStates?: number; minConfidence?: number } = {}): Parse {
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const minConfidence = options.minConfidence ?? 0.55;

  const root: State = {
    parent: null,
    decision: null,
    lastAnchor: null,
    runningSum: 0,
    lastAnchorLine: null,
    span: 0,
    score: 0,
    constraintScore: 0,
    unexplained: 0,
    contradictions: 0,
    anchors: 0,
    amounts: 0,
    chains: 0,
  };

  let beam: State[] = [root];

  for (const line of lines) {
    const next = new Map<string, State>();

    const consider = (state: State) => {
      const key = `${state.lastAnchor ?? 'x'}|${round2(state.runningSum)}`;
      const existing = next.get(key);
      if (!existing || state.score > existing.score) next.set(key, state);
    };

    for (const state of beam) {
      // A line is processed as a unit, because money tokens sharing a line are
      // read together (`$2.49  $1189.42` is an amount and its balance). Processing
      // them independently let a token be silently dropped whenever a sibling on
      // the same line was consumed, which under-reported unexplained money and
      // allowed a wrong parse to look clean.
      expandLine(state, line, minConfidence, consider);
    }

    beam = [...next.values()].sort((a, b) => b.score - a.score);
    if (beam.length > maxStates) beam = beam.slice(0, maxStates);
  }

  return materialise(beam[0]);
}


/**
 * Enumerate the readings of one line.
 *
 * Every money token is either consumed — as an amount, as a balance, or as the
 * start of a new chain — or explicitly charged as unexplained. Nothing may be
 * dropped for free: that is what makes `unexplainedMoneyTokens` a meaningful
 * signal, and it is the term that catches a parse which satisfies the arithmetic
 * by ignoring half the figures on the page.
 */
function expandLine(
  state: State,
  line: LineEvent,
  minConfidence: number,
  consider: (state: State) => void,
  index = 0,
): void {
  if (index >= line.money.length) {
    consider(state);
    return;
  }

  const candidate = line.money[index];
  const rest = (patch: Partial<State>, decision: Decision) =>
    expandLine(
      {
        parent: state,
        decision,
        lastAnchor: patch.lastAnchor ?? state.lastAnchor,
        runningSum: patch.runningSum ?? state.runningSum,
        lastAnchorLine: patch.lastAnchorLine ?? state.lastAnchorLine,
        span: patch.span ?? state.span,
        score: patch.score ?? state.score,
        constraintScore: patch.constraintScore ?? state.constraintScore,
        unexplained: patch.unexplained ?? state.unexplained,
        contradictions: patch.contradictions ?? state.contradictions,
        anchors: patch.anchors ?? state.anchors,
        amounts: patch.amounts ?? state.amounts,
        chains: patch.chains ?? state.chains,
      },
      line,
      minConfidence,
      consider,
      index + 1,
    );

  // Leave this token unexplained. Costs in proportion to how much it looked like
  // money, so a reference number is cheap to ignore and `1.234,56` is not.
  const skippedCost = candidate.confidence ** 2 * W_UNEXPLAINED;
  rest(
    { score: state.score - skippedCost, unexplained: state.unexplained + skippedCost },
    { kind: 'skip', lineId: line.id, token: candidate.token },
  );

  if (candidate.confidence < minConfidence) return;

  const token = candidate.token;
  const value = candidate.reading.magnitude;

  // An explicit minus, parenthesis or DR is the statement telling us the
  // direction; only unsigned figures are genuinely ambiguous.
  const signChoices: number[] = candidate.reading.evidence.hasSign
    ? [candidate.reading.value < 0 ? -1 : 1]
    : [1, -1];

  for (const sign of signChoices) {
    rest(
      {
        runningSum: round2(state.runningSum + sign * value),
        span: state.span + 1,
        score: state.score - W_AMOUNT_COST * candidate.confidence,
        amounts: state.amounts + 1,
      },
      { kind: 'amount', token, signedValue: sign * value, lineId: line.id },
    );
  }

  const anchorValue = candidate.reading.value;

  // Starting a fresh chain is always available: a statement may hold several
  // independent running balances, and a figure that does not continue the current
  // chain is usually the start of another one.
  rest(
    {
      lastAnchor: anchorValue,
      runningSum: 0,
      lastAnchorLine: line.id,
      span: 0,
      score: state.score - W_CHAIN_START,
      anchors: state.anchors + 1,
      chains: state.chains + 1,
    },
    { kind: 'chain', token, signedValue: anchorValue, lineId: line.id },
  );

  if (state.lastAnchor === null) return;

  const computed = round2(state.lastAnchor + state.runningSum);
  if (Math.abs(computed - anchorValue) > BALANCE_TOLERANCE) {
    // The arithmetic says this reading is wrong, and there is deliberately no
    // branch that admits it anyway. Permitting one let the search buy a satisfied
    // constraint by paying for a contradiction, which is how a wrong parse
    // outscored the correct one on a real Capital One statement.
    return;
  }

  const constraint: BalanceConstraint = {
    fromLine: state.lastAnchorLine ?? line.id,
    toLine: line.id,
    fromValue: state.lastAnchor,
    toValue: anchorValue,
    delta: round2(anchorValue - state.lastAnchor),
    computed,
    passed: true,
    spans: state.span,
  };
  const bonus = W_CONSTRAINT + W_SPAN * state.span;

  rest(
    {
      lastAnchor: anchorValue,
      runningSum: 0,
      lastAnchorLine: line.id,
      span: 0,
      score: state.score + bonus,
      constraintScore: state.constraintScore + bonus,
      anchors: state.anchors + 1,
    },
    { kind: 'anchor', token, signedValue: anchorValue, lineId: line.id, constraint },
  );
}

function materialise(final: State): Parse {
  const chain: Decision[] = [];
  for (let node: State | null = final; node && node.decision; node = node.parent) chain.push(node.decision);
  chain.reverse();

  const roles = new Map<string, Role>();
  const amounts: DecodedAmount[] = [];
  const anchors: Parse['anchors'] = [];
  const constraints: BalanceConstraint[] = [];
  const rejected: Parse['rejected'] = [];

  for (const decision of chain) {
    if (decision.kind === 'amount' && decision.token) {
      roles.set(decision.token.id, 'amount');
      amounts.push({
        token: decision.token,
        value: decision.signedValue ?? 0,
        role: 'amount',
        lineId: decision.lineId ?? '',
      });
    } else if (decision.kind === 'anchor' && decision.token) {
      roles.set(decision.token.id, 'anchor');
      anchors.push({ token: decision.token, value: decision.signedValue ?? 0, lineId: decision.lineId ?? '' });
      if (decision.constraint) {
        constraints.push(decision.constraint);
        if (!decision.constraint.passed) {
          rejected.push({
            token: decision.token,
            reason: `anchored at ${decision.signedValue?.toFixed(2)} but the chain computed ${decision.constraint.computed.toFixed(2)}`,
          });
        }
      }
    }
  }

  return {
    roles,
    amounts,
    anchors,
    constraints,
    score: final.score,
    terms: {
      constraintScore: final.constraintScore,
      anchors: final.anchors,
      amounts: final.amounts,
      ignored: 0,
      unexplained: round2(final.unexplained),
      contradictions: final.contradictions,
    },
    rejected,
  };
}
