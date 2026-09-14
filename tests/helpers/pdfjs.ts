/**
 * Node-side pdf.js loader for tests.
 *
 * Lives in tests/ on purpose: the production converter never touches this file,
 * so the bundle cannot accidentally pull in the Node build.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const PDFJS_ROOT = path.dirname(require.resolve('pdfjs-dist/package.json'));
const STANDARD_FONTS = path.join(PDFJS_ROOT, 'standard_fonts') + path.sep;

export const FIXTURE_DIR = path.join(process.cwd(), 'fixtures');

/** Absolute path to a fixture PDF. */
export function pdfPath(name: string): string {
  return path.join(FIXTURE_DIR, 'pdf', `${name}.pdf`);
}

export function readExpected(name: string): {
  name: string;
  openingBalance: number;
  transactions: Array<{ date: string; description: string; amount: number; balance: number }>;
} {
  const file = path.join(FIXTURE_DIR, 'expected', `${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function listFixtures(): string[] {
  const dir = path.join(FIXTURE_DIR, 'pdf');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.pdf'))
    .map((file) => file.replace(/\.pdf$/, ''))
    .sort();
}

export async function openFixture(name: string, password?: string) {
  const data = new Uint8Array(fs.readFileSync(path.join(FIXTURE_DIR, 'pdf', `${name}.pdf`)));
  return pdfjs.getDocument({
    data,
    password,
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: STANDARD_FONTS,
  }).promise;
}

/** Open any PDF by absolute path — used for the real-statement corpus. */
export async function openPdf(absolutePath: string, password?: string) {
  const data = new Uint8Array(fs.readFileSync(absolutePath));
  return pdfjs.getDocument({
    data,
    password,
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: STANDARD_FONTS,
  }).promise;
}

export { pdfjs };
