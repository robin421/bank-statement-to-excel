import type { ExtractTextOptions, PdfJsLikeDocument, PdfPageText, PdfTextItem } from './types';
import { PdfNoTextLayerError, PdfTooLargeError } from './types';

export const DEFAULT_MAX_PAGES = 200;

const WHITESPACE_RUN = /\s+/g;

function isTextRun(item: unknown): item is { str: string; transform: number[]; width: number; height: number } {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  return typeof candidate.str === 'string' && Array.isArray(candidate.transform);
}

/**
 * Walk a pdf.js document and return normalized text items with a top-left
 * origin. pdf.js reports `transform[5]` as a baseline measured from the bottom
 * of the page, which is unusable for reading order, so we flip it here — and
 * only here — so every downstream module can assume "smaller y is higher up".
 */
export async function extractPages(
  doc: PdfJsLikeDocument,
  options: ExtractTextOptions = {},
): Promise<PdfPageText[]> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const total = doc.numPages;
  if (total > maxPages) throw new PdfTooLargeError(total, maxPages);

  const pages: PdfPageText[] = [];
  let totalChars = 0;

  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: PdfTextItem[] = [];
    for (const raw of content.items ?? []) {
      if (!isTextRun(raw)) continue;
      const str = raw.str.replace(WHITESPACE_RUN, ' ');
      if (!str.trim()) continue;
      const x = Number(raw.transform[4]) || 0;
      const baselineFromBottom = Number(raw.transform[5]) || 0;
      const height = Math.abs(Number(raw.height) || Number(raw.transform[3]) || 0);
      items.push({
        str,
        x,
        y: viewport.height - baselineFromBottom,
        w: Math.abs(Number(raw.width) || 0),
        h: height || 1,
      });
      totalChars += str.trim().length;
    }

    pages.push({ pageNumber, width: viewport.width, height: viewport.height, items });
    options.onProgress?.(pageNumber, total);
  }

  if (totalChars < 20) throw new PdfNoTextLayerError();
  return pages;
}
