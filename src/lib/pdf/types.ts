/**
 * Environment-agnostic view of extracted PDF text.
 *
 * Deliberately does NOT import pdfjs-dist: the browser bundle and the Node test
 * harness load pdf.js themselves and hand us a duck-typed document. That keeps
 * the whole extraction/parsing pipeline unit-testable in Node and impossible to
 * accidentally couple to a DOM.
 */

export interface PdfTextItem {
  /** Raw text run as reported by pdf.js. */
  str: string;
  /** Left edge in page units, origin top-left of the page. */
  x: number;
  /** Baseline distance from the TOP of the page (pdf.js y is measured from the bottom). */
  y: number;
  /** Advance width of the run. */
  w: number;
  /** Font height of the run. */
  h: number;
}

export interface PdfPageText {
  pageNumber: number;
  width: number;
  height: number;
  items: PdfTextItem[];
}

/** Minimal duck-typed surface of a pdf.js PDFDocumentProxy. */
export interface PdfJsLikeDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsLikePage>;
}

export interface PdfJsLikePage {
  getViewport(params: { scale: number }): { width: number; height: number };
  getTextContent(params?: Record<string, unknown>): Promise<{ items: unknown[] }>;
}

export interface ExtractTextOptions {
  /** Hard cap so a 900-page statement cannot freeze a tab. */
  maxPages?: number;
  /** Called as each page completes, for progress UI. */
  onProgress?: (done: number, total: number) => void;
}

export class PdfPasswordRequiredError extends Error {
  readonly code = 'PASSWORD_REQUIRED';
  constructor(message = 'This PDF is password protected.') {
    super(message);
    this.name = 'PdfPasswordRequiredError';
  }
}

export class PdfTooLargeError extends Error {
  readonly code = 'TOO_MANY_PAGES';
  constructor(pages: number, max: number) {
    super(`This PDF has ${pages} pages; the in-browser limit is ${max}.`);
    this.name = 'PdfTooLargeError';
  }
}

export class PdfNoTextLayerError extends Error {
  readonly code = 'NO_TEXT_LAYER';
  constructor(message = 'This PDF has no extractable text layer (it is probably a scan).') {
    super(message);
    this.name = 'PdfNoTextLayerError';
  }
}
