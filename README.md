# StatementToExcel

**Convert a bank statement PDF to Excel or CSV in your browser. The file is never uploaded, and every row is checked against the statement's running balance.**

👉 **https://www.wattflow.net** · free · no sign-up

## What it does

- Reads the text-based PDF statements you download from online banking, and OFX / QFX exports
- Rebuilds the transaction table from the positions of the text on the page (no per-bank templates)
- Checks every row: previous balance + amount = balance. Rows that don't reconcile are flagged, not hidden.
- Exports:
  - **Excel (.xlsx)**: *Transactions* (Date, Description, Debit, Credit, Amount, Balance, Notes), *Summary* (what was verified) and *Raw* (the source line behind each row)
  - **CSV**: correct quoting, UTF-8 with BOM, comma or semicolon delimiter
  - **QuickBooks Online CSV** (Date, Description, Amount) and **Xero CSV** (Date, Amount, Payee, Description, Reference)
- Date/number formats for the US, UK, Australia, Canada and India. Interface in English, Español, Deutsch, Français, Português and हिन्दी.

## Privacy: processing is local

The PDF is opened and parsed by JavaScript in your browser tab. There is no upload endpoint, no storage and no queue. After the page has loaded, the converter works offline. The end-to-end smoke test in this repo checks this by watching every network request the page makes during a conversion. Google Analytics only loads after you accept the consent banner, and your statement's contents are never sent either way.

## Supported input

| Input | Supported |
|---|---|
| Text-based PDF from online banking (up to 60 MB / 200 pages) | ✅ |
| OFX / QFX export | ✅ |
| Scanned or photographed statement (image PDF, JPG, PNG) | ❌ Needs OCR. See [Scanned statements](https://www.wattflow.net/scanned/). |
| PDF with a broken text layer (some custom bank fonts) | ❌ Detected and reported. No rows are made up. |

## Limits

- No scans or photos (see above)
- One statement at a time; no batch mode yet
- No categorisation of spending
- It is a conversion tool, not an audit. Spot-check the output against the original statement before you file, reconcile or lend against it.

## Pages for specific jobs

- [PDF bank statement to Excel](https://www.wattflow.net/pdf-bank-statement-to-excel/)
- [Bank statement to CSV](https://www.wattflow.net/bank-statement-to-csv/)
- [Bank statement to QuickBooks Online CSV](https://www.wattflow.net/quickbooks-csv/)
- [Bank statement to Xero CSV](https://www.wattflow.net/xero-csv/)
- [OFX / QFX to CSV and Excel](https://www.wattflow.net/ofx-qfx-to-csv/)
- [Extract transactions from a statement PDF](https://www.wattflow.net/extract-transactions/)

## How it's funded

Free, with no subscription and no row limit. The site is supported by advertising and by referrals to OCR services for scanned statements the tool can't read.

## Licence

**Source-available, all rights reserved.** See [LICENSE](LICENSE). You may read the code and the engineering notes. You may not copy, redistribute or use them commercially.

## Feedback

A statement that doesn't reconcile is the most useful bug report. Please open an issue describing the layout (**never attach a real statement**).

---

## For developers

[![CI](https://github.com/robin421/bank-statement-to-excel/actions/workflows/ci.yml/badge.svg)](https://github.com/robin421/bank-statement-to-excel/actions/workflows/ci.yml)

A bank-statement → Excel/CSV converter that runs entirely in the browser, and checks its own output
against the statement's running balance before offering it to you.

The product thesis: every tool in this category claims accuracy. This one **proves** it — a bank
statement is a self-checking document (`previous balance + amount = balance` on every row), so we use
that invariant to pick the columns, fix the signs, and count the rows we failed to read.

- **Privacy claim:** nothing is uploaded. There is no upload endpoint. The browser smoke test asserts
  this by watching every network request the page makes while converting.
- **Honesty claim:** a scanned PDF is refused with an explanation rather than converted into
  plausible-but-wrong rows.

### Live

**https://www.wattflow.net** — deployed on Vercel (project `bank-statement-to-excel`).

Source: **https://github.com/robin421/bank-statement-to-excel** (public). After cloning,
run `git config core.hooksPath .githooks` to enable the pre-commit guard described in
[Corpus policy](#corpus-policy).

**Licence: source-available, all rights reserved — see [LICENSE](LICENSE).** The
repository is public so the engineering record can be read: the architecture notes, the
blind-evaluation methodology and the corpus policy are written to be learned from.
Public visibility does not grant reuse rights, and the code may not be copied,
redistributed or used commercially.

---

### Quick start

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
| `npm run smoke` | Playwright end-to-end test; pass a URL to test a deployment |
| `npm run fixtures` | Regenerate the synthetic statement corpus |

`npm run smoke https://www.wattflow.net` runs the whole suite against production,
which is the only way to verify that the deployed CSP has not broken pdf.js's worker.

---

### The accuracy gate

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

### How the parser works

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

### Layout

```
src/
  lib/pdf/         pdf.js loading, text extraction, friendly error mapping
  lib/parse/       the statement parser (pure, Node-testable, no DOM)
  lib/ofx/         OFX/QFX parsing
  lib/exporters/   xlsx, csv, QuickBooks, Xero, date formatting
  components/converter/   the React island (dropzone, password, preview, download)
  pages/           the SEO page set — one canonical URL per search-intent cluster
  data/keywords.ts the keyword→URL map (one canonical URL per intent)
  data/banks.ts    the bank dataset, gated on real verification
fixtures/          generator + committed synthetic PDFs + ground truth
tests/             vitest suites (parser, exporters, OFX) + Node pdf.js helper
scripts/           smoke.mjs (Playwright), strip-appledouble.mjs
```

The parser deliberately does **not** import pdf.js: `extractPages()` takes a duck-typed document, so
the whole pipeline is unit-testable in Node and cannot accidentally depend on the DOM.

---

### Testing against real statements, not just our own

The synthetic corpus scored **100%** while real Sparkasse and Postbank statements
parsed to **zero rows**. A corpus you generate yourself tests your assumptions,
not the world. That gap is the single most useful thing this project has learned,
so there are now two corpora:

| Corpus | Lives in | Committed | Purpose |
|---|---|---|---|
| Synthetic | `fixtures/pdf/` | yes | Precise, deterministic checks of known behaviours |
| Real | `fixtures/real/` | **no** | Catches what synthetic fixtures cannot |

The real corpus is not committed — the files are third-party documents. Their
*results* are: `fixtures/real-baseline.json` records what the parser currently
achieves, and `tests/real-corpus.spec.ts` fails if any statement gets worse. The
suite skips cleanly when the files are absent.

The baseline is a **floor, not a target**. Several of these layouts do not parse
properly yet. Raise the numbers as the parser improves; never lower them to make
a build pass.

#### Current state of the real corpus

```
parsed        9
refused       2   (image-only PDFs — the parser says so rather than guessing)
publishable   1
```

"Publishable" means the statement reconciled against its own running balance,
which is the bar for a bank page. One out of eleven is the honest number, and the
test asserts it so it cannot quietly be assumed higher.

#### Getting the corpus

Banks publish sample statements for customers. Search the bank's own domain for
`filetype:pdf "sample statement"` — a statement downloaded from anywhere else is
usually an SEO-spam template that proves nothing about the real layout.

```bash
npm run verify:bank -- fixtures/real/chase-jan.pdf --bank chase   # one statement
npm run inspect:statement -- fixtures/real/x.pdf 40 bands         # what the parser sees
npm run verify:real                                                # re-record the baseline
```

#### Bugs these real statements found

Every one of these passed the synthetic corpus:

- **Merged text runs.** Real PDFs draw `01.10.2021 Lastschrift -790,00` as a
  *single* run, so "a date is its own cell" was false and the statement produced
  no rows at all. `parse/tokens.ts` now splits a leading date and a trailing
  amount out of a run.
- **Month names were English-only.** A German statement printing `01. Okt 2021`
  parsed to no date, and therefore to no rows. `tests/months.spec.ts` now walks
  all twelve months in seven languages — it immediately caught `dic`, `abr`,
  `ago` and `mars` missing, and a wrong `maer` → January.
- **`23.05.` read as the amount 2305.** Postbank stacks the year under the date,
  so the day/month arrives with a trailing separator. `normalizeNumeric` accepted
  it as `2305.` and turned a date into money.
- **Swiss apostrophe thousands.** `48'671.25` was not a number. The export side
  already wrote `1'234.56` for `de-CH`; the import side never read it.
- **Reference lines became columns.** `26 26060 00000 00000 00000` concatenated
  into a 19-digit integer, producing a 114pt-wide column band that overlapped the
  real ones and destroyed the column model. Amounts are now sanity-capped.
- **Band matching took the first overlap** rather than the nearest anchor.

### Bank pages, and why most of them do not exist

`/banks/` explains how to get a readable file out of any bank. Individual
`/banks/<bank>/` pages **only exist for banks we have tested a real statement
from**, and none are published today.

The reason is specific: a page per bank with the same copy and the name swapped
is a doorway page by Google's own definition, and on a domain this new it is not
a risk worth taking for a handful of long-tail queries. It is also dishonest —
we would be asserting a layout we had never seen.

So the layout notes in `src/data/banks.ts` are stored as **hypotheses**, not
claims:

```ts
{ text: 'Debits print with a leading minus sign.', state: 'hypothesis' }
```

They are written down because a hypothesis is a test plan. The gate is
`isVerified()`, and `tests/banks.spec.ts` asserts that (a) an untested bank is
never publishable and (b) a note cannot claim `confirmed` without a verification
behind it.

#### The verification workflow

Put the statement in `fixtures/real/` (gitignored — statements are PII and must
never be committed) and run:

```bash
npm run verify:bank -- fixtures/real/chase-jan.pdf --bank chase
npm run verify:bank -- fixtures/real/hdfc.pdf --bank hdfc --password 1234
```

It prints pages read, rows recovered, the detected layout, the date order and
whether the document proved it, the quality verdict, and the balance-chain
result — then lists that bank's hypotheses so each can be confirmed or refuted.
Exit code is 0 only when the statement reconciled, so it can gate a release.

The report written to `fixtures/reports/` is deliberately **aggregate-only**: no
merchant names or descriptions, so it is safe to paste into a commit message or
an issue.

When a statement passes, record it in `src/data/banks.ts`:

```ts
verifications: [{ date: '2025-03-01', pages: 3, rows: 61, reconcileRate: 1, dateOrder: 'MDY', issues: [] }],
layoutNotes: [
  { text: 'Debits print with a leading minus sign.', state: 'confirmed', observation: 'Held on all 61 rows.' },
],
```

The page then generates itself, and it carries the real test result rather than a
claim. Adding a bank to `BANKS` without a verification changes nothing — the page
still will not be built.

### Languages

Six interface languages, and — separately — sixteen **export locales**.

Those are different problems and conflating them breaks the product:

| | What it changes | Example |
|---|---|---|
| UI language (`en`, `de`, `es`, `fr`, `pt`, `hi`) | What the interface says | `Deutsch`, `हिन्दी` |
| Export locale (`de-DE`, `es-MX`, `en-IN`, …) | How numbers, dates and CSV separators are written | `1.234,56` vs `1,234.56` |

A German user needs a German interface **and** a file German Excel can open. A
German interface with `-1234.56` in a comma-delimited CSV is unusable: German
Excel reads `,` as the decimal separator, so the whole file lands in one column.

So the rules the code enforces (and `tests/locales.spec.ts` asserts):

- **A decimal comma forces a semicolon delimiter.** Comma-delimited data with
  comma decimals cannot be parsed by the Excel builds those users run.
- **Exported numbers never carry thousands separators.** `-1234,56`, not
  `-1.234,56`. A French grouping separator is a space, which would split the
  field outright; grouping is display-only for that reason.
- **A comma is only quoted when it is the delimiter.** RFC 4180 quoting applied
  literally is how `405,81` becomes `"405,81"` and arrives in Excel as *text*.
- **Indian English is a format, not a translation.** `en-IN` is English with
  lakh/crore grouping (`12,34,567.89`). Translating the interface would never
  have fixed that.
- **XLSX writes typed values**, so Excel applies the reader's own locale — the
  one output format that cannot get a decimal separator wrong.

#### Adding a language

1. Add the locale to `LOCALES` and its export formats to `EXPORT_LOCALES` in
   `src/i18n/locales.ts`.
2. Add a dictionary to `src/i18n/ui.ts`. English is the source of truth and every
   dictionary is typed as complete, so **a missing key is a compile error** — a
   half-translated UI cannot ship.
3. Add homepage content to `src/i18n/home.ts` and a one-line page under
   `src/pages/<code>/index.astro`.

Localised homepages are deliberately **not** translations of the English page:
they name the banks of that market, state that market's number and date
conventions, and target the queries people actually type there. A flat
translation would be thin content competing with itself.

#### Translation status

`LOCALES[code].translationStatus` is `needs-review` for every non-English
locale. The structure and the market facts are deliberate; **the prose needs a
native speaker's pass before it is worth promoting.** The status is data, not a
comment, so it can gate a release later.

Deeper pages (`/bank-statement-to-csv`, `/quickbooks-csv`, …) are English-only.
They are not listed as alternates on other locales — `hreflang` pointing at a
404 wastes crawl budget, so alternates are opt-in per page via the
`translations` prop on `Base.astro`, and the sitemap integration only emits
`xhtml:link` for paths that really exist in more than one language.

### Configuration

Copy `.env.example` to `.env`:

| Variable | Purpose |
|---|---|
| `PUBLIC_SITE_URL` | Canonical origin for canonicals, sitemap and OG tags. **Set this when you buy the domain** — it is the only place an origin is hardcoded. |
| `PUBLIC_CF_ANALYTICS_TOKEN` | Cloudflare Web Analytics. Cookieless, so no consent banner is needed. Empty = no analytics at all. |
| `PUBLIC_AFFILIATE_OCR_URL` | OCR offer shown on `/scanned` and as the fallback when a PDF has no text layer. Empty = the page renders honest guidance instead of a CTA. |
| `PUBLIC_ADSENSE_CLIENT` | AdSense publisher id. Empty = ad slots render nothing at all. |

---

### Deploying

Vercel, already wired up (`vercel.json`):

```bash
vercel env add PUBLIC_SITE_URL production --value https://your-domain.com --yes
vercel --prod
```

Settings Vercel uses: build `npm run build`, output `dist`, Node `>=22.13` (pdf.js 6), Astro framework
detection. `vercel.json` also sets:

- **`installCommand` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.** Playwright is a devDependency used
  only by `scripts/smoke.mjs` locally; without this its postinstall downloads ~150 MB of browsers on
  every deploy.
- **A Content-Security-Policy.** `connect-src` is the directive that matters: it is what makes the
  "your statement never leaves the browser" claim *enforceable* rather than a promise. Google's ad
  hosts are pre-listed so enabling AdSense later does not silently break the page. Verified by a smoke
  check that fails on any CSP violation — pdf.js runs fine without `'unsafe-eval'`.
- **Immutable caching** for `/_astro/*` (content-hashed) and `must-revalidate` for `/`.

`dist/` is a plain static directory, so any static host also works. There is no backend to scale,
migrate or roll back beyond the deploy itself.

#### Go-live checklist

1. **Day-0 keyword validation (not done — do this before spending on content).** The keyword map in
   `src/data/keywords.ts` is a hypothesis. Check the five primaries in a real SERP tool and, more
   importantly, check *intent*: a large share of "bank statement to excel" volume wants a spreadsheet
   **template**, not a converter. If that is the mix, the H1 and the above-the-fold copy change. Also
   confirm the `bank statement converter` and `csv bank statement converter` phrasings.
2. **Buy the domain**, set `PUBLIC_SITE_URL` in Vercel to it, add the domain in the Vercel project,
   redeploy, then confirm canonicals and `sitemap-index.xml` point at it.
3. Verify the property in Google Search Console and submit `sitemap-index.xml`.
4. Set `PUBLIC_CF_ANALYTICS_TOKEN` (Cloudflare Web Analytics is cookieless — no cookie banner needed).
   Note the CSP already allows `static.cloudflareinsights.com`.
5. Apply for AdSense **after** the content pages are indexed. Ad slots are below the fold only, and they
   render nothing while the client id is empty — a thin tool page with ads on it is a fast rejection.
6. Add a certified CMP before enabling AdSense for EEA/UK traffic.
7. Fill in the `verified` counts on the bank pages once you have graded real statements. Do not publish
   layout claims you have not tested.

---

### Analytics and consent

Two analytics products, with different privacy properties, and the difference is the
point.

**Cloudflare Web Analytics** — cookieless, no fingerprinting, no consent banner needed.
Aggregate page views, referrers and country.

**Google Analytics 4** — opt-in, and **nothing about it runs until the visitor
accepts.** No script, no cookie, no ping. Not even a cookieless one.

That last part is a deliberate departure from the usual setup. Google Consent Mode
with `analytics_storage: denied` by default is compliant and is the right choice when
conversion modelling matters — but it still sends cookieless pings before anyone
agreed. On a site whose headline claim is that nothing leaves your machine, making
third-party requests before consent while telling the visitor the opposite is not a
trade worth making. So the tag is loaded from the click handler, and Consent Mode
defaults are still set inline so that anything Google-related loading later — AdSense,
if it is ever enabled — starts from a refusal rather than a guess.

Consent is stored in `localStorage` under `analytics-consent`, not a cookie, so
recording the decision does not create the thing the decision is about. Clearing site
data asks again.

#### What the events carry

The funnel is `statement_submitted` → `statement_parsed` → `export_download`, plus
`statement_error`. Parameters are counts, ratios and category names:

```
pages, rows, reconcile_rate, quality, source, reason, preset, date_format,
export_locale
```

**Nothing read out of the statement.** No descriptions, amounts, balances, dates,
account numbers or file names. `tests/analytics.spec.ts` scans every `track()` call
site and fails on any parameter outside that list, so
`description: transaction.description` cannot ship — it breaks the build rather than
silently sending a merchant name to Google.

#### Configuration

Set `PUBLIC_GA4_ID` (for example `G-XXXXXXXXXX`) in the environment. Leaving it empty —
the default in this repository — disables the whole feature: no script, no banner, no
third-party request.

#### How the privacy claim is tested

The browser smoke suite carries out a real conversion and asserts four things:

| Check | Claim |
|---|---|
| no external requests before consent | "nothing runs until you allow it" |
| no request carries statement content | matched against strings that exist only in the fixture |
| no request outside the connect-src allowlist | the CSP is the enforcement, and it is verified |
| consenting loads the tag, banner does not reappear | the feature actually works, and is not merely inert |

A single "no external requests at all" assertion would have had to be deleted to
accommodate analytics. Splitting it into claims that stay true in both configurations
keeps the guarantee instead of trading it away.

### Corpus policy

The repository is public. Two rules follow from that, and both are enforced rather
than merely stated.

**Real bank statements are never committed.** `fixtures/real/`, `corpus/court/`,
`corpus/candidates/` and `corpus/dump/` are gitignored, and `.githooks/pre-commit`
rejects any `.pdf` outside `fixtures/pdf/` as well as any file over 1 MB. Enable it
once per clone:

```bash
git config core.hooksPath .githooks
```

The reason the hook exists rather than trusting `.gitignore`: ten real statement
PDFs (about 56 MB) were committed to `corpus/court/` because that directory was
never added to `.gitignore`, and they had to be purged from history with
`git filter-repo` afterwards. Directory-by-directory rules only protect the paths
someone remembered.

What *is* committed from corpus work is the **aggregate evidence**: the acquisition
reports, the blind-evaluation manifest with its ground truth, and the frozen v0
result artifacts. A report states a conclusion; those files are the measurements
behind it.

**Frozen results are append-only.** `artifacts/blind-eval-v0/` is the record of the
one blind run this parser version ever received. It is never edited, recomputed or
reinterpreted. Corrections go in a new document, so that a reader can always see
what was known before a change was made rather than only what is believed now.

Files that have been run through the parser are no longer blind. The 8 statements of
the v0 set and the 19 of the regression corpus may be used for regression only;
coverage claims require statements that have never been executed.

#### What CI does and does not prove

`.github/workflows/ci.yml` runs typecheck, unit tests, the static build and the
internal link checker. Because the real corpus is gitignored, the real-statement
tests **skip** in CI. A green run therefore says nothing about real bank statements,
and the workflow says so in a comment. Real-corpus regression is run locally, where
the fixtures exist.

### Deliberate non-goals

- **No OCR.** Accurate OCR on a dense table needs real compute. `/scanned` says so and routes people
  to a referral instead of pretending.
- **No upload, ever, in the free tool.** If a paid batch tier is added later, it must be a separate,
  clearly-labelled path with the privacy trade-off stated up front.
- **No AI chat wrapper, no multi-tool farm.**
- **No per-bank parsing templates.** A template that matches last year's layout fails silently; the
  balance check fails loudly, which is the correct failure mode.
