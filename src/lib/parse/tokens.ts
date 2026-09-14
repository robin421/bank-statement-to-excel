import { parseDate } from './date';
import type { TextCell } from './rows';

/**
 * Split a text run into the cells a human would see.
 *
 * pdf.js returns whatever the PDF drew as one operation. Real statements often
 * draw a whole transaction line as a single run:
 *
 *     "01.10.2021 Lastschrift -790,00"
 *
 * Treating that as one cell means no date is found, and the statement yields
 * zero rows — which is exactly what happened on the first real Sparkasse and
 * Postbank statements tested. Synthetic fixtures never showed this because the
 * generator drew each column separately.
 *
 * We only split off a leading date token and a trailing amount token, because
 * those are the two pieces the parser needs in their own cell. Everything in
 * between stays as the description, where it belongs.
 *
 * Character positions are estimated from the run's total width, assuming a
 * uniform advance. That is approximate, but it is used only to place a date
 * (left-aligned, so the left edge is close) and an amount (right-aligned, so the
 * right edge is close) — and the balance-chain check downstream catches a bad
 * guess rather than letting it through.
 */

/** A single whitespace-delimited piece of a run, e.g. "01.10.2021". */
function isDateToken(text: string): boolean {
  const cleaned = text.replace(/[,.]$/, '');
  return Boolean(parseDate(cleaned, 'DMY', null) ?? parseDate(cleaned, 'MDY', null));
}

function isMoneyToken(text: string): boolean {
  // Shape check only; parseAmount does the real work later. A token has to look
  // like a number with a decimal part, a sign, or a currency symbol.
  return /^[-−(]?\s*[$€£₹]?\s*\d[\d'’.,\s]*\d\s*[)]?(?:\s*(?:CR|DR))?$/i.test(text) && /\d[.,]\d{2}\b|\d{2}[.,]\d{2}/.test(text);
}

interface Piece {
  str: string;
  start: number;
  end: number;
}

/** Character offsets of each whitespace-separated token in the raw run. */
function tokenPieces(raw: string): Piece[] {
  const pieces: Piece[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    pieces.push({ str: match[0], start: match.index, end: match.index + match[0].length });
  }
  return pieces;
}

export function splitCellTokens(cell: TextCell): TextCell[] {
  const raw = cell.str;
  if (!raw.trim()) return [cell];

  const pieces = tokenPieces(raw);
  if (pieces.length < 2) return [cell];

  const advance = cell.w / Math.max(raw.length, 1);
  const slice = (start: number, end: number, str: string): TextCell => ({
    ...cell,
    str,
    x: cell.x + start * advance,
    w: (end - start) * advance,
  });

  let leadingEnd = -1;
  let leadingText = '';

  // A leading date, one token ("04.09.19") or two ("01. Okt 2021").
  // Longest first: `01. Okt 2021` must win over the partial `01. Okt`, or the
  // year is left behind as description text.
  for (const take of [3, 2, 1]) {
    if (pieces.length <= take) continue;
    const candidate = pieces
      .slice(0, take)
      .map((piece) => piece.str)
      .join(' ');
    if (!isDateToken(candidate)) continue;
    leadingEnd = pieces[take - 1].end;
    leadingText = candidate;
    break;
  }

  let trailingStart = -1;
  let trailingText = '';
  if (pieces.length > (leadingEnd >= 0 ? 1 : 1)) {
    const last = pieces[pieces.length - 1];
    if (isMoneyToken(last.str) && (leadingEnd < 0 || pieces.length > 2)) {
      trailingStart = last.start;
      trailingText = last.str;
    }
  }

  const out: TextCell[] = [];

  if (leadingEnd >= 0) {
    out.push(slice(0, leadingEnd, leadingText));
  }

  const middleStart = leadingEnd >= 0 ? leadingEnd : 0;
  const middleEnd = trailingStart >= 0 ? trailingStart : raw.length;
  const middle = raw.slice(middleStart, middleEnd);
  if (middle.trim()) out.push(slice(middleStart, middleEnd, middle.trim()));

  if (trailingStart >= 0) {
    out.push(slice(trailingStart, raw.length, trailingText));
  }

  return out.length > 1 ? out : [cell];
}
