import { median } from './cluster';
import type { PdfPageText, PdfTextItem } from '../pdf/types';

export interface TextCell extends PdfTextItem {
  page: number;
}

export interface Row {
  page: number;
  /** Baseline distance from the top of the page. */
  y: number;
  cells: TextCell[];
  /** Cells joined left-to-right, with spaces reconstructed from layout gaps. */
  text: string;
  /** Median font height on the row — also the basis for the space threshold. */
  height: number;
}

/**
 * Group text runs into visual rows.
 *
 * pdf.js returns text runs in content-stream order, not reading order, and a
 * "row" is not a thing it exposes at all. Clustering on the baseline is the only
 * reliable way to rebuild a table, and the tolerance has to scale with the font
 * size or large print statements merge lines together.
 */
export function buildRows(pages: PdfPageText[]): Row[] {
  const rows: Row[] = [];

  for (const page of pages) {
    if (!page.items.length) continue;

    const heights = page.items.map((item) => item.h).filter((h) => h > 0 && h < 200);
    const bodyHeight = median(heights) || 10;
    const tolerance = Math.max(1.5, bodyHeight * 0.5);

    const sorted = [...page.items].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

    let bucket: PdfTextItem[] = [];
    let anchor = Number.NaN;

    const flush = () => {
      if (!bucket.length) return;
      const cells: TextCell[] = bucket
        .map((item) => ({ ...item, page: page.pageNumber }))
        .sort((a, b) => a.x - b.x);
      const rowHeight = median(cells.map((cell) => cell.h).filter((h) => h > 0)) || bodyHeight;
      rows.push({
        page: page.pageNumber,
        y: median(cells.map((cell) => cell.y)),
        cells,
        text: joinCells(cells, Math.max(1.2, rowHeight * 0.18)),
        height: rowHeight,
      });
      bucket = [];
    };

    for (const item of sorted) {
      if (!bucket.length) {
        bucket.push(item);
        anchor = item.y;
        continue;
      }
      if (Math.abs(item.y - anchor) <= tolerance) {
        bucket.push(item);
        anchor = (anchor * (bucket.length - 1) + item.y) / bucket.length;
      } else {
        flush();
        bucket.push(item);
        anchor = item.y;
      }
    }
    flush();
  }

  return rows;
}

/**
 * Concatenate runs into readable text. A gap wider than roughly a fifth of the
 * font size is a word space; anything narrower is kerning or a split glyph
 * inside a number (e.g. `1,234.56` arriving as three runs), and inserting a
 * space there would corrupt the amount.
 */
function joinCells(cells: TextCell[], gap: number): string {
  let out = '';
  let prevEnd: number | null = null;

  for (const cell of cells) {
    if (prevEnd !== null) {
      const space = cell.x - prevEnd;
      if (space > gap && !/\s$/.test(out) && !/^\s/.test(cell.str)) out += ' ';
    }
    out += cell.str;
    prevEnd = cell.x + cell.w;
  }

  return out.replace(/\s+/g, ' ').trim();
}

/** Normalized text used for repeated-header/footer detection. */
export function normalizeRowKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/[^a-z#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
