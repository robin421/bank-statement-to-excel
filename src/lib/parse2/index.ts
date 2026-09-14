import { extractPages } from '../pdf/extractPages';
import type { PdfPageText } from '../pdf/types';
import { buildLines, type LineIndex } from './lines';
import { decode, type Parse, type ReconciledChain } from './decode';
import { documentYear, inferOrder, type DateOrder } from './dates';
import { selectChain, type ChainSelectionResult } from './chain-selection/select';

/**
 * The experiment's entry point.
 *
 * Not wired into the app. `src/lib/parse` remains the production parser; this
 * module exists to answer whether accounting constraints plus chain selection can
 * replace it, and nothing imports it.
 *
 * The two stages are kept apart on purpose:
 *
 *   reconciliation   which readings are financially self-consistent?
 *   selection        which of those is the transaction detail the user wants?
 *
 * Merging them into one score is what produced the previous stage's wrong answer,
 * where a summary chain that balances exactly outranked the ledger it summarises.
 */

export interface Parse2Result {
  parse: Parse;
  /** Every reconciled chain considered, winner and alternatives together. */
  candidates: ReconciledChain[];
  selection: ChainSelectionResult;
  index: LineIndex;
  dateOrder: { order: DateOrder; ambiguous: boolean };
  year: number | null;
}

export function parseDocument(pages: PdfPageText[], options: { selectionOptions?: Parameters<typeof selectChain>[2] } = {}): Parse2Result {
  const index = buildLines(pages);
  const { order, ambiguous } = inferOrder(index.graph.tokens);
  const year = documentYear(index.graph.tokens);

  const parse = decode(index.lines);
  const candidates = [...parse.chains, ...parse.alternatives];
  const selection = selectChain(candidates, index.lines, options.selectionOptions);

  return { parse, candidates, selection, index, dateOrder: { order, ambiguous }, year };
}

export { buildLines, decode, selectChain, extractPages };
export type { Parse, ReconciledChain, ChainSelectionResult, LineIndex };
