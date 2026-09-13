import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractPages } from './extractPages';
import { toFriendlyPdfError } from './errors';
import { convertPages, type ConvertOptions, type StatementResult } from '../parse';
import { DEFAULT_MAX_PAGES } from './extractPages';
import { looksLikeOfx, parseOfx } from '../ofx/parse';

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/**
 * Load pdf.js on demand.
 *
 * A static import would pull ~1 MB of parser into the initial page load and
 * would also be evaluated during static rendering, where pdf.js warns about the
 * Node build. Deferring it means the homepage ships marketing HTML and only
 * fetches the parser once someone actually picks a file.
 */
async function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((module) => {
      module.GlobalWorkerOptions.workerSrc = workerUrl;
      return module;
    });
  }
  return pdfjsPromise;
}

export type ConvertStage = 'reading' | 'extracting' | 'parsing' | 'done';

export interface ConvertProgress {
  stage: ConvertStage;
  done?: number;
  total?: number;
}

export interface ConvertFileOptions extends Omit<ConvertOptions, 'onProgress'> {
  /** User-supplied password for an encrypted statement. */
  password?: string;
  onProgress?: (progress: ConvertProgress) => void;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Convert a File/Blob entirely in the browser.
 *
 * Nothing is uploaded: the bytes go straight into pdf.js, which runs its own
 * parser in a Web Worker, and the row/column heuristics are cheap enough
 * (sub-second even at the 200 page cap) that a second worker would add failure
 * modes without buying responsiveness. We yield between stages so the progress
 * UI paints.
 *
 * Re-reads the buffer on every attempt so a password retry cannot hit a
 * detached ArrayBuffer.
 */
export async function convertFile(file: File | Blob, options: ConvertFileOptions = {}): Promise<StatementResult> {
  options.onProgress?.({ stage: 'reading' });
  const bytes = new Uint8Array(await file.arrayBuffer());

  // OFX/QFX is structured data, so it never needs the layout heuristics.
  // Detected by content, not by extension, because banks mislabel exports.
  if (looksLikeOfx(bytes)) {
    options.onProgress?.({ stage: 'parsing' });
    const result = parseOfx(new TextDecoder('utf-8', { fatal: false }).decode(bytes), (file as File).name ?? 'statement.ofx');
    options.onProgress?.({ stage: 'done' });
    return result;
  }

  const pdfjs = await getPdfjs();

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    doc = await pdfjs.getDocument({
      data: bytes,
      password: options.password,
      disableFontFace: false,
      useSystemFonts: true,
    }).promise;
  } catch (error) {
    throw toFriendlyPdfError(error);
  }

  options.onProgress?.({ stage: 'extracting', done: 0, total: doc.numPages });
  const pages = await extractPages(doc, {
    maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
    onProgress: (done, total) => options.onProgress?.({ stage: 'extracting', done, total }),
  });

  await yieldToBrowser();
  options.onProgress?.({ stage: 'parsing' });
  const result = convertPages(pages, { dateOrder: options.dateOrder, statementYear: options.statementYear });
  await yieldToBrowser();
  options.onProgress?.({ stage: 'done' });

  try {
    // Release the pdf.js worker's memory. Best-effort: a failure here must not
    // lose a result the user already has.
    await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
  } catch {
    // ignore
  }

  return result;
}

export { DEFAULT_MAX_PAGES };
