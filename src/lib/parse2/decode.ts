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
/** Cost of admitting a token as an amount, before the isolation factor. */
const W_AMOUNT_COST = 1.5;
/**
 * How much more expensive it is to read an *isolated* figure as a transaction.
 *
 * A summary figure — `$194.17` under "your account(s) have earned:" — lines up
 * with nothing. Every real transaction amount on the same page lines up with
 * several others. Without this, a parse could chain three isolated summary
 * figures, satisfy the arithmetic, and be accepted.
 */
const W_ISOLATION = 5;
/**
 * A balance constraint is only worth as much as the figures it chains.
 *
 * This is the term that makes the verification mean something. A chain built
 * entirely from isolated figures is arithmetically self-consistent and tells you
 * nothing; a chain built from populated numeric columns is real evidence. The
 * bonus is scaled by the weaker of the anchor quality and the mean amount
 * quality, so one unsupported link weakens the whole chain.
 */
const MIN_EVIDENCE_QUALITY = 0.15;
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
  /** Column support behind this chain, 0..1. Low means it proves little. */
  evidenceQuality: number;
}

/**
 * One financially self-consistent chain: an opening reading, a closing reading,
 * and the amounts between them that explain the difference.
 *
 * A parse may contain several. Commerce Bank's sample holds a summary chain
 * (`7126.11 + 3615.08 - 20.00 - 200.00 = 10521.19`) and a transaction ledger, and
 * both satisfy the accounting constraints. Reporting them separately is what makes
 * "which one is the detail?" a question the parser can answer instead of hiding.
 */
export interface ReconciledChain {
  id: string;
  /** Anchor readings, in document order. At least the opening and closing of the chain. */
  anchors: Array<{ token: PdfToken; value: number; lineId: string }>;
  constraints: BalanceConstraint[];
  amounts: DecodedAmount[];
  opening: number;
  closing: number;
  startLine: string;
  endLine: string;
  pageStart: number;
  pageEnd: number;
}

export interface Parse {
  roles: Map<string, Role>;
  /** Independent chains inside this parse. */
  chains: ReconciledChain[];
  /**
   * Reconciled chains that appeared in near-optimal parses but not in the winner.
   *
   * The beam's objective maximises accounting evidence, so a detail ledger that
   * costs more than the summary it sits beside can lose outright and vanish from
   * the winning parse. Keeping the runner-up chains is what lets chain selection
   * see a competing interpretation at all, and what lets `partial` mean something
   * rather than "the parser shrugged".
   */
  alternatives: ReconciledChain[];
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
  /** Sum of column support over the amounts since the last anchor. */
  spanSupport: number;
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
    spanSupport: 0,
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

  const parse = materialise(beam[0]);

  // Collect chains from competing parses, but only from parses that are
  // *materially competitive on accounting*.
  //
  // Taking them from any beam state made the ambiguity check fire on statements
  // that have a single sensible reading: a parse scoring far worse still contains
  // chains, and those chains can look well-dated. An alternative only competes if
  // the interpretation it belongs to was nearly as good an explanation of the
  // arithmetic. Otherwise this is not ambiguity, it is just the runner-up.
  const seen = new Set(parse.chains.map(chainSignature));
  const alternatives: ReconciledChain[] = [];
  const floor = COMPETITIVE_SCORE_FLOOR(beam[0].score);

  for (const state of beam.slice(1, ALT_PARSE_DEPTH + 1)) {
    if (state.score < floor) break;
    for (const chain of materialise(state).chains) {
      const signature = chainSignature(chain);
      if (seen.has(signature)) continue;
      seen.add(signature);
      alternatives.push(chain);
    }
  }

  return { ...parse, alternatives };
}

/** How many competing parses are mined for alternative chains. */
const ALT_PARSE_DEPTH = 12;

/**
 * How much worse a parse may score and still count as a competing interpretation.
 *
 * Absolute slack plus a fraction of the best score, because the score accumulates
 * per amount and per constraint and so scales with statement size. A statement
 * with 200 amounts should tolerate more absolute difference than one with five.
 */
export function COMPETITIVE_SCORE_FLOOR(best: number): number {
  return best - Math.max(6, Math.abs(best) * 0.12);
}

/**
 * Identity of a chain is the transactions it produces, not the readings it used.
 *
 * Two parses that extract the same amounts over the same balance span are the same
 * answer to the user, even if one also anchored on a closing-balance row and the
 * other consumed it as a trailing amount. Signing on anchors made those two count
 * as competing interpretations, which reported a statement as ambiguous with
 * itself.
 */
function chainSignature(chain: ReconciledChain): string {
  const amounts = chain.amounts
    .map((amount) => amount.token.id)
    .sort()
    .join(',');
  return `${chain.opening.toFixed(2)}->${chain.closing.toFixed(2)}|${amounts}`;
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
        spanSupport: patch.spanSupport ?? state.spanSupport,
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

  // Reading an isolated figure as a transaction is possible — some statements do
  // print a lone amount — but it costs, in proportion to how little support the
  // column gives it.
  const isolation = 1 + W_ISOLATION * (1 - candidate.columnSupport);
  const amountCost = W_AMOUNT_COST * candidate.confidence * isolation;

  for (const sign of signChoices) {
    rest(
      {
        runningSum: round2(state.runningSum + sign * value),
        span: state.span + 1,
        spanSupport: state.spanSupport + candidate.columnSupport,
        score: state.score - amountCost,
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
      spanSupport: 0,
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

  // Evidence quality: the weaker of the anchor's column support and the mean
  // support of the amounts chained. A chain of isolated summary figures scores
  // near zero however exactly it balances, which is what stops a self-consistent
  // but wrong parse from being accepted.
  const meanAmountSupport = state.span > 0 ? state.spanSupport / state.span : 0;
  const evidenceQuality = Math.max(
    MIN_EVIDENCE_QUALITY,
    Math.min(candidate.columnSupport, meanAmountSupport),
  );

  const constraint: BalanceConstraint = {
    fromLine: state.lastAnchorLine ?? line.id,
    toLine: line.id,
    fromValue: state.lastAnchor,
    toValue: anchorValue,
    delta: round2(anchorValue - state.lastAnchor),
    computed,
    passed: true,
    spans: state.span,
    evidenceQuality,
  };
  const bonus = (W_CONSTRAINT + W_SPAN * state.span) * evidenceQuality;

  rest(
    {
      lastAnchor: anchorValue,
      runningSum: 0,
      lastAnchorLine: line.id,
      span: 0,
      spanSupport: 0,
      score: state.score + bonus,
      constraintScore: state.constraintScore + bonus,
      anchors: state.anchors + 1,
    },
    { kind: 'anchor', token, signedValue: anchorValue, lineId: line.id, constraint },
  );
}

/**
 * Split a decision sequence into independent chains.
 *
 * A `chain` decision opens one; every satisfied `anchor` that follows extends it,
 * and the amounts in between belong to it. This is a segmentation of the parse,
 * not a new judgement — it invents no rule about what a chain is.
 */
function segmentChains(decisions: Decision[]): ReconciledChain[] {
  const chains: ReconciledChain[] = [];
  let current: ReconciledChain | null = null;
  /**
   * Amounts seen since the last accepted constraint.
   *
   * They are only promoted into the chain when a constraint spans them. An amount
   * consumed after the closing anchor is spanned by nothing, so it is unverified
   * arithmetic dressed up as a transaction, and it must not count as evidence or
   * appear in the output. On a Capital One sample exactly this turned the closing
   * balance row into a fourth "transaction" and made a correct parse look
   * ambiguous with itself.
   */
  let pending: DecodedAmount[] = [];

  const open = (token: PdfToken, value: number, lineId: string): ReconciledChain => ({
    id: `chain${chains.length}`,
    anchors: [{ token, value, lineId }],
    constraints: [],
    amounts: [],
    opening: value,
    closing: value,
    startLine: lineId,
    endLine: lineId,
    pageStart: token.page,
    pageEnd: token.page,
  });

  for (const decision of decisions) {
    if (!decision.token) continue;
    if (decision.kind === 'chain') {
      if (current && current.constraints.length) chains.push(current);
      current = open(decision.token, decision.signedValue ?? 0, decision.lineId ?? '');
      pending = [];
      continue;
    }
    if (!current) continue;
    if (decision.kind === 'anchor' && decision.constraint) {
      // Everything accumulated since the previous anchor is now spanned by a
      // constraint, so it is verified and belongs to the chain.
      current.amounts.push(...pending);
      pending = [];
      current.anchors.push({ token: decision.token, value: decision.signedValue ?? 0, lineId: decision.lineId ?? '' });
      current.constraints.push(decision.constraint);
      current.closing = decision.signedValue ?? 0;
      current.endLine = decision.lineId ?? current.endLine;
      current.pageEnd = Math.max(current.pageEnd, decision.token.page);
      continue;
    }
    if (decision.kind === 'amount') {
      pending.push({
        token: decision.token,
        value: decision.signedValue ?? 0,
        role: 'amount',
        lineId: decision.lineId ?? '',
      });
    }
  }
  if (current && current.constraints.length) chains.push(current);
  return chains;
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
    chains: segmentChains(chain),
    // Filled in by `decode`, which is the only place that can see the competing
    // parses; `materialise` only ever sees one of them.
    alternatives: [],
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
