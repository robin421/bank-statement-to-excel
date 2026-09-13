# StatementToExcel

A bank-statement → Excel/CSV converter that runs entirely in the browser, and checks its own output
against the statement's running balance before offering it to you.

The product thesis: every tool in this category claims accuracy. This one **proves** it — a bank
statement is a self-checking document (`previous balance + amount = balance` on every row), so we use
that invariant to pick the columns, fix the signs, and count the rows we failed to read.

- **Privacy claim:** nothing is uploaded. There is no upload endpoint. The browser smoke test asserts
  this by watching every network request the page makes while converting.
- **Honesty claim:** a scanned PDF is refused with an explanation rather than converted into
  plausible-but-wrong rows.

---

## Quick start

```bash
npm install
npm run fixtures     # generate the synthetic test statements + ground truth
npm test             # the accuracy gate (see below)
npm run dev          # http://localhost:4321
```

Other scripts:

| Script | What it does |
|---|---|
| `npm run build` | Static build into `dist/`, then strips macOS sidecar files |
| `npm run typecheck` | `tsc --noEmit` over `src/` and `tests/` |
| `npm run verify` | typecheck + unit tests + build |
| `npm run smoke` | Playwright end-to-end test against a real browser |
| `npm run fixtures` | Regenerate the synthetic statement corpus |

---

## The accuracy gate

`npm test` is not a smoke test. It parses a corpus of synthetic statements with known contents and
fails if the parser drops or invents rows:

- **≥ 95% row recall and precision** on every clean layout
- **≥ 95% balance reconciliation** (typically 100%)
- a scanned PDF must be **refused**, not guessed at
- a garbage text layer must be reported as `needs_ocr`
- a password-protected PDF must be detected and openable with the password

Fixtures live in `fixtures/generate.mjs` and are generated, never committed real data — real
statements are PII. They cover: US/UK/EU/Indian layouts, debit-vs-credit and signed-amount shapes,
parenthesised negatives, EU decimal commas, Indian 2-digit grouping, multi-line descriptions, a
repeated page header across three pages, a Wells-Fargo-style daily-balance summary block that looks
like transactions, single-page layouts with no balance column, plus encrypted, image-only and
garbage-text-layer PDFs.

**Real statements never go in the repo.** Put them in `fixtures/real/` (gitignored) and grade locally.

---

## How the parser works

```
PDF bytes
  └─ pdf.js getTextContent()            src/lib/pdf/extractPages.ts   → text runs with x/y/width/height
      └─ cluster baselines into rows    src/lib/parse/rows.ts         → rows, with word gaps reconstructed
          └─ cluster right edges        src/lib/parse/columns.ts      → column bands from money alignment
              └─ score role hypotheses  src/lib/parse/transactions.ts → which column is debit/credit/amount/balance
                  └─ balance chain      src/lib/parse/reconcile.ts   → verification, sign correction, row count
                      └─ export         src/lib/exporters/           → xlsx / csv / QuickBooks / Xero
```

Two decisions worth knowing:

- **Columns come from content, not whitespace.** Money is right-aligned, so right edges cluster
  tightly even when the values differ in width. Projection profiles (the classic approach) shatter on
  variable-width descriptions.
- **The running balance is the oracle.** It decides which column is the balance, corrects unsigned
  debits, and turns "we dropped a row" into a visible, localised mismatch instead of silence. Header
  labels are only a tie-breaker, because labels are often missing or wrong while arithmetic is not.

OFX/QFX (`src/lib/ofx/parse.ts`) is structured data, so it skips all of the above and derives a
running balance from the ledger balance so the same exporters and the same verification apply.

---

## Layout

```
src/
  lib/pdf/         pdf.js loading, text extraction, friendly error mapping
  lib/parse/       the statement parser (pure, Node-testable, no DOM)
  lib/ofx/         OFX/QFX parsing
  lib/exporters/   xlsx, csv, QuickBooks, Xero, date formatting
  components/converter/   the React island (dropzone, password, preview, download)
  pages/           the SEO page set — one canonical URL per search-intent cluster
  data/keywords.ts the keyword→URL map, and the per-bank notes
fixtures/          generator + committed synthetic PDFs + ground truth
tests/             vitest suites (parser, exporters, OFX) + Node pdf.js helper
scripts/           smoke.mjs (Playwright), strip-appledouble.mjs
```

The parser deliberately does **not** import pdf.js: `extractPages()` takes a duck-typed document, so
the whole pipeline is unit-testable in Node and cannot accidentally depend on the DOM.

---

## Configuration

Copy `.env.example` to `.env`:

| Variable | Purpose |
|---|---|
| `PUBLIC_SITE_URL` | Canonical origin for canonicals, sitemap and OG tags. **Set this when you buy the domain** — it is the only place an origin is hardcoded. |
| `PUBLIC_CF_ANALYTICS_TOKEN` | Cloudflare Web Analytics. Cookieless, so no consent banner is needed. Empty = no analytics at all. |
| `PUBLIC_AFFILIATE_OCR_URL` | OCR offer shown on `/scanned` and as the fallback when a PDF has no text layer. Empty = the page renders honest guidance instead of a CTA. |
| `PUBLIC_ADSENSE_CLIENT` | AdSense publisher id. Empty = ad slots render nothing at all. |

---

## Deploying

Cloudflare Pages (or any static host):

- Build command: `npm run build`
- Output directory: `dist`
- Node: 22.13+ / 24 (pdf.js 6 and Astro 7 require it)
- Env: set `PUBLIC_SITE_URL`, and optionally the analytics/affiliate/adsense values above

Nothing is server-rendered and there is no backend, so there is nothing to scale, migrate or roll
back beyond the deploy itself.

### Go-live checklist

1. **Day-0 keyword validation (not done yet — do this before spending on content).** The keyword map
   in `src/data/keywords.ts` is a hypothesis. Check the five primaries in a real SERP tool and, more
   importantly, check *intent*: a large share of "bank statement to excel" volume wants a
   spreadsheet **template**, not a converter. If that is the mix, the H1 and the above-the-fold copy
   change. Also confirm `bank statement converter` and `csv bank statement converter` phrasing.
2. Buy the domain, set `PUBLIC_SITE_URL`, rebuild, confirm canonicals and `sitemap-index.xml`.
3. Verify the property in Google Search Console and submit the sitemap.
4. Set `PUBLIC_CF_ANALYTICS_TOKEN` (cookieless — no cookie banner needed).
5. Apply for AdSense **after** the content pages are indexed. Ad slots are below the fold only, and
   they render nothing while the client id is empty — a thin tool page with ads on it is a fast
   rejection.
6. Add a certified CMP before enabling AdSense for EEA/UK traffic.
7. Add real `verified` counts to `src/data/banks/*` notes once you have graded real statements. Do not
   publish layout claims you have not tested.

---

## Deliberate non-goals

- **No OCR.** Accurate OCR on a dense table needs real compute. `/scanned` says so and routes people
  to a referral instead of pretending.
- **No upload, ever, in the free tool.** If a paid batch tier is added later, it must be a separate,
  clearly-labelled path with the privacy trade-off stated up front.
- **No AI chat wrapper, no multi-tool farm.**
- **No per-bank parsing templates.** A template that matches last year's layout fails silently; the
  balance check fails loudly, which is the correct failure mode.
