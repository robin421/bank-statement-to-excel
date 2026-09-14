import { median } from '../parse/cluster';
import type { PdfPageText } from '../pdf/types';

/**
 * Layer 1 — the 2-D token graph.
 *
 * The previous parser collapsed PDFs into "rows" immediately, and every later
 * stage inherited that decision. Real statements break it: fields are stacked on
 * two baselines, entries span five lines, columns are mutually exclusive. So this
 * layer keeps the original geometry and derives *relationships*, without deciding
 * what anything is.
 *
 * Tolerances are measured from the document rather than hard-coded. A fixed
 * `ROW_TOLERANCE = 3` is wrong for a 6pt footnote and wrong for a 14pt heading;
 * the line pitch is a property of the document, so it is read from the document.
 */

export interface PdfToken {
  id: string;
  page: number;
  text: string;
  /** Left edge. */
  x: number;
  /** Baseline distance from the top of the page. */
  y: number;
  width: number;
  height: number;
  /** Bounding box, top-origin: y1 is the visual top, y2 the visual bottom. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fontSize: number;
  /** Reading-order index within the page. */
  order: number;
  /** The pdf.js run this word came from. Words drawn together share a run. */
  runId: string;
  /**
   * True when x/width were interpolated within a multi-word run.
   * A single-word run has exact geometry; a word inside a longer run does not,
   * and the decoder must not treat the two as equally precise.
   */
  estimated: boolean;
}

export interface PageMetrics {
  page: number;
  width: number;
  height: number;
  /** Vertical distance between successive text baselines. Measured, not assumed. */
  linePitch: number;
  medianFontSize: number;
}

export interface DocumentTokens {
  tokens: PdfToken[];
  metrics: PageMetrics;
  /** Tokens that share a baseline, keyed by token id. */
  sameBaseline: Map<string, string[]>;
  /** Tokens directly beneath with overlapping x — a stacked field, e.g. `23.05.` over `2023`. */
  stackedBelow: Map<string, string[]>;
  /** Nearest token to the right on the same baseline. */
  rightOf: Map<string, string | undefined>;
  leftOf: Map<string, string | undefined>;
}

function isTextRun(item: unknown): item is { str: string; x: number; y: number; w: number; h: number } {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  return typeof candidate.str === 'string' && typeof candidate.x === 'number';
}
void isTextRun;

/**
 * Estimate the document's line pitch from the spacing between consecutive
 * baselines. Using the median rather than the mean keeps a document with one
 * large paragraph break from inflating the value.
 */
function measureLinePitch(ys: number[]): number {
  const sorted = [...new Set(ys.map((y) => Math.round(y * 10) / 10))].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 0.5) gaps.push(gap);
  }
  if (!gaps.length) return 12;
  const all = median(gaps);
  // Ignore paragraph breaks: keep gaps within 2x the median, then re-measure.
  const ordinary = gaps.filter((gap) => gap <= all * 2);
  return median(ordinary.length >= 3 ? ordinary : gaps) || 12;
}

export function buildTokenGraph(pages: PdfPageText[]): DocumentTokens {
  const tokens: PdfToken[] = [];
  const metricsByPage = new Map<number, PageMetrics>();

  for (const page of pages) {
    // extractPages has already normalised pdf.js items to {str, x, y, w, h} with
    // a top-left origin, so this layer stays free of pdf.js shapes.
    const runs = page.items;
    const heights = runs.map((run) => run.h).filter((h) => h > 0 && h < 200);
    const medianFontSize = median(heights) || 10;
    const linePitch = measureLinePitch(runs.map((run) => run.y));

    let order = 0;
    let runIndex = 0;
    for (const run of runs) {
      const height = run.h || medianFontSize;
      const y = run.y;
      const runId = `p${page.pageNumber}r${runIndex++}`;
      const raw = run.str;

      // Word-level tokens. A run like "01.10.2021 Lastschrift -790,00" is three
      // things a human reads as three columns; emitting it as one token was the
      // bug that made a real Sparkasse statement parse to zero rows. Splitting
      // here means every later stage sees a uniform granularity instead of
      // having to guess at run boundaries.
      const advance = raw.length ? run.w / raw.length : 0;
      const multiple = raw.trim().split(/\s+/).filter(Boolean).length > 1;
      const pattern = /\S+/g;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(raw)) !== null) {
        const word = match[0];
        const start = match.index;
        const width = advance > 0 ? word.length * advance : run.w;
        const x = run.x + (advance > 0 ? start * advance : 0);
        tokens.push({
          id: `t${tokens.length}`,
          page: page.pageNumber,
          text: word,
          x,
          y,
          width,
          height,
          x1: x,
          y1: y - height * 0.8,
          x2: x + width,
          y2: y + height * 0.25,
          fontSize: height,
          order: order++,
          runId,
          estimated: multiple,
        });
      }
    }

    metricsByPage.set(page.pageNumber, {
      page: page.pageNumber,
      width: page.width,
      height: page.height,
      linePitch,
      medianFontSize,
    });
  }

  // A single pitch for the document: pages of one statement agree, and using the
  // median across pages is more stable than trusting a sparse first page.
  const metrics: PageMetrics = {
    page: 0,
    width: pages[0]?.width ?? 0,
    height: pages[0]?.height ?? 0,
    linePitch: median([...metricsByPage.values()].map((m) => m.linePitch)) || 12,
    medianFontSize: median([...metricsByPage.values()].map((m) => m.medianFontSize)) || 10,
  };

  return link(tokens, metrics);
}

function link(tokens: PdfToken[], metrics: PageMetrics): DocumentTokens {
  const sameBaseline = new Map<string, string[]>();
  const stackedBelow = new Map<string, string[]>();
  const rightOf = new Map<string, string | undefined>();
  const leftOf = new Map<string, string | undefined>();

  const byPage = new Map<number, PdfToken[]>();
  for (const token of tokens) {
    const list = byPage.get(token.page);
    if (list) list.push(token);
    else byPage.set(token.page, [token]);
  }

  // Half the measured line pitch: two baselines closer than that are the same
  // visual line. Derived from the document, so a 6pt footnote and a 14pt heading
  // both behave.
  const baselineTolerance = Math.max(0.5, metrics.linePitch * 0.5);
  // A stacked field sits within roughly one line below, sharing horizontal space.
  const stackedTolerance = metrics.linePitch * 1.4;

  for (const pageTokens of byPage.values()) {
    const ordered = [...pageTokens].sort((a, b) => a.y - b.y || a.x - b.x);

    for (const token of ordered) {
      const line = ordered.filter((other) => other !== token && Math.abs(other.y - token.y) <= baselineTolerance);
      sameBaseline.set(token.id, line.map((other) => other.id));

      const neighbours = line
        .filter((other) => other.x > token.x)
        .sort((a, b) => a.x - b.x);
      rightOf.set(token.id, neighbours[0]?.id);

      const leftNeighbours = line
        .filter((other) => other.x < token.x)
        .sort((a, b) => b.x - a.x);
      leftOf.set(token.id, leftNeighbours[0]?.id);

      // Stacked: below, overlapping horizontally, within about one line.
      const below = ordered.filter(
        (other) =>
          other.y > token.y &&
          other.y - token.y <= stackedTolerance &&
          other.x1 < token.x2 &&
          other.x2 > token.x1,
      );
      stackedBelow.set(token.id, below.map((other) => other.id));
    }
  }

  return { tokens, metrics, sameBaseline, stackedBelow, rightOf, leftOf };
}

/** Tokens grouped into visual lines, in reading order. Convenience, not a decision. */
export function visualLines(graph: DocumentTokens): PdfToken[][] {
  const seen = new Set<string>();
  const lines: PdfToken[][] = [];
  const tolerance = Math.max(0.5, graph.metrics.linePitch * 0.5);

  for (const token of graph.tokens) {
    if (seen.has(token.id)) continue;
    const group = graph.tokens.filter((other) => other.page === token.page && Math.abs(other.y - token.y) <= tolerance);
    for (const member of group) seen.add(member.id);
    lines.push(group.sort((a, b) => a.x - b.x));
  }

  return lines.sort((a, b) => (a[0].page - b[0].page) || (a[0].y - b[0].y));
}
