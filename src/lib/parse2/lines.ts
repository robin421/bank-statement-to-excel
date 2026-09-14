import { parseDate } from '../parse/date';
import { moneyCandidates, type MoneyCandidate } from './amounts';
import { buildTokenGraph, type DocumentTokens, type PdfToken } from './tokens';

/**
 * Line events — the decoder's input sequence.
 *
 * A "line event" is one visual baseline that carries at least one money token,
 * plus the date and description tokens that sit on or beside it. It is
 * deliberately *not* a logical transaction: a transaction may span several lines,
 * and deciding which lines belong together is a separate question that the
 * decoder answers with arithmetic rather than with a rule like "a row with a date
 * starts a transaction".
 *
 * The important property is that the money sequence is robust even when the
 * transaction grouping is not: a five-line entry still contributes one amount, on
 * whichever line it happens to be printed.
 */

export interface LineEvent {
  id: string;
  page: number;
  y: number;
  tokens: PdfToken[];
  money: MoneyCandidate[];
  dateTokens: PdfToken[];
  descriptionTokens: PdfToken[];
}

export interface LineIndex {
  graph: DocumentTokens;
  lines: LineEvent[];
  /** Money tokens grouped by the column their right edge clusters into. */
  columns: Map<string, MoneyCandidate[]>;
}

/**
 * A token is date-like if it parses as a date on its own, or if it is a
 * day/month fragment with the year stacked immediately below — Postbank prints
 * `23.05.` over `2023`, and refusing those would drop every date on the page.
 */
function stackedYear(graph: DocumentTokens, token: PdfToken): number | null {
  for (const id of graph.stackedBelow.get(token.id) ?? []) {
    const below = graph.tokens.find((candidate) => candidate.id === id);
    if (!below) continue;
    const year = below.text.match(/^(19|20)\d{2}$/);
    if (year) return Number.parseInt(below.text, 10);
  }
  return null;
}

export function buildLines(pages: Parameters<typeof buildTokenGraph>[0]): LineIndex {
  const graph = buildTokenGraph(pages);
  const money = moneyCandidates(graph.tokens, graph.metrics.linePitch, graph.metrics.medianFontSize);
  const moneyByToken = new Map(money.map((candidate) => [candidate.token.id, candidate]));

  const tolerance = Math.max(0.5, graph.metrics.linePitch * 0.5);
  const consumed = new Set<string>();
  const lines: LineEvent[] = [];

  for (const token of graph.tokens) {
    if (consumed.has(token.id)) continue;
    const group = graph.tokens
      .filter((other) => other.page === token.page && Math.abs(other.y - token.y) <= tolerance)
      .sort((a, b) => a.x - b.x);
    for (const member of group) consumed.add(member.id);

    const moneyOnLine = group.map((member) => moneyByToken.get(member.id)).filter((entry): entry is MoneyCandidate => Boolean(entry));
    if (!moneyOnLine.length) continue;

    const dateTokens = group.filter((member) => {
      const text = member.text.trim().replace(/[,;]$/, '');
      if (parseDate(text, 'DMY', null) ?? parseDate(text, 'MDY', null)) return true;
      // `23.05.` alone is not a complete date; with the year stacked below it is.
      return /^\d{1,2}[/\-.]\d{1,2}\.?$/.test(text) && stackedYear(graph, member) !== null;
    });

    lines.push({
      id: `L${lines.length}`,
      page: token.page,
      y: token.y,
      tokens: group,
      money: moneyOnLine,
      dateTokens,
      descriptionTokens: group.filter((member) => !moneyByToken.has(member.id) && !dateTokens.includes(member)),
    });
  }

  lines.sort((a, b) => a.page - b.page || a.y - b.y);

  const columns = new Map<string, MoneyCandidate[]>();
  for (const candidate of money) {
    const key = candidate.columnId ?? 'none';
    const list = columns.get(key);
    if (list) list.push(candidate);
    else columns.set(key, [candidate]);
  }

  return { graph, lines, columns };
}

/** Resolve a line's date tokens to ISO dates, using the document year for stacked fragments. */
export function lineDates(index: LineIndex, line: LineEvent, order: 'MDY' | 'DMY', year: number | null): string[] {
  const out: string[] = [];
  for (const token of line.dateTokens) {
    const text = token.text.trim().replace(/[,;]$/, '');
    const direct = parseDate(text, order, year);
    if (direct) {
      out.push(direct.iso);
      continue;
    }
    const stacked = /\d{1,2}[/\-.]\d{1,2}\.?/.test(text) ? parseDate(text, order, year) : null;
    if (stacked) out.push(stacked.iso);
  }
  void index;
  return out;
}
