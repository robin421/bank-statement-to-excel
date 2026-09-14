#!/usr/bin/env node
/**
 * Corpus admission inspector.
 *
 * Deliberately NOT the parser. This extracts raw text with pdf.js and nothing
 * else — no token graph, no candidate generation, no arithmetic checks — so a
 * human can read a candidate document and judge it.
 *
 * That separation is the point of this stage: admission must not be decided by
 * whether the parser happens to succeed, or the blind corpus is contaminated
 * before it is ever used. The arithmetic in a candidate is verified by reading the
 * numbers on the page, exactly as a person would.
 *
 *   npm run corpus:dump -- corpus/candidates/A01-wellsfargo-read.pdf
 *   npm run corpus:dump -- --all
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const FONTS = `${path.dirname(require.resolve('pdfjs-dist/package.json'))}/standard_fonts/`;

const OUT = 'corpus/dump';
// npm forwards a bare `--` before our own flags; drop it.
const args = process.argv.slice(2).filter((arg) => arg !== '--');

const files =
  args[0] === '--all'
    ? fs
        .readdirSync('corpus/candidates')
        .filter((name) => name.endsWith('.pdf'))
        .sort()
        .map((name) => path.join('corpus/candidates', name))
    : args.filter((arg) => !arg.startsWith('--'));

if (!files.length) {
  console.error('usage: npm run corpus:dump -- <file.pdf> | --all');
  process.exit(2);
}

fs.mkdirSync(OUT, { recursive: true });

for (const file of files) {
  const name = path.basename(file, '.pdf');
  const report = { name, pages: 0, characters: 0, textLayer: false, note: '' };
  try {
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(fs.readFileSync(file)),
      useSystemFonts: false,
      disableFontFace: true,
      standardFontDataUrl: FONTS,
    }).promise;

    report.pages = doc.numPages;
    const chunks = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = [];
      for (const item of content.items) {
        if (item && typeof item.str === 'string' && item.str.trim()) lines.push(item.str.trim());
      }
      chunks.push(`\n===== page ${pageNumber} =====\n${lines.join('\n')}`);
    }
    await doc.destroy?.();

    const text = chunks.join('\n');
    report.characters = text.replace(/\s/g, '').length;
    report.textLayer = report.characters > 100;
    fs.writeFileSync(path.join(OUT, `${name}.txt`), text);

    console.log(
      `${name.padEnd(34)} pages=${String(report.pages).padStart(3)}  chars=${String(report.characters).padStart(7)}  textLayer=${report.textLayer ? 'yes' : 'NO '}`,
    );
  } catch (error) {
    report.note = error?.name ?? 'error';
    fs.writeFileSync(path.join(OUT, `${name}.txt`), '');
    console.log(`${name.padEnd(34)} READ FAILED: ${report.note}`);
  }
}
