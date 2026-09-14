# Parser design brief — where the geometric approach breaks

Written to be readable without the repository. Numbers are measured, not estimated.

---

## 1. What the tool is, and the constraints that cannot move

A web tool that converts a bank statement PDF into Excel/CSV. Three constraints are
load-bearing for the whole product and are not negotiable without destroying it:

1. **It runs entirely client-side.** The PDF bytes go into `pdf.js` in a browser tab.
   There is no upload endpoint. The site's CSP sets `connect-src 'self'` and a browser
   test asserts that zero external requests occur during a conversion. The entire
   positioning is "your statement never leaves your machine", and it is *enforced*, not
   merely claimed.
2. **It is free and needs no server.** No per-conversion cost, no queue, no GPU.
3. **It fails honestly.** Every row is checked against the statement's own running
   balance (`previous_balance + amount == balance`, to the cent). Rows that fail are
   flagged; a PDF with no usable text layer is refused with an explanation rather than
   converted into plausible-looking rows. This is the other half of the positioning.

Constraint 3 is what makes the current situation a *product* problem rather than a
*trust* problem: the tool does not lie, it just fails to produce anything on many real
statements.

---

## 2. How the parser works

Pure geometry, no ML, no per-bank templates. Six stages:

```
PDF bytes
 └─ pdf.js getTextContent()  →  text runs with {str, x, y(baseline, top-origin), w, h}
     └─ rows:      cluster runs by baseline. tolerance = max(1.5, median_font_height * 0.5)
         └─ tokens: split a *leading date* and a *trailing amount* out of a merged run,
         │          estimating character positions from the run's total width
             └─ columns: separate cells into kind ∈ {date, money, weak_number, text}
                 ├─ date bands  = cluster LEFT edges (x) of date cells,   min 2 members
                 └─ money bands = cluster RIGHT edges (x+w) of money cells, min 2 members
                     └─ roles: enumerate 2–5 hypotheses mapping money bands onto
                     │         {debit, credit, amount, balance}, ordered by x and by
                     │         header labels when a header row is found
                     │         build transactions under each; score each as
                     │         0.8 * reconcile_pass_rate + 0.2 * coverage; take the max
                         └─ transactions: a row containing a *standalone date cell* starts
                             an entry; following rows without a date are folded into its
                             description; money on a continuation row attaches to the
                             current entry if it has none yet
```

The design bet: **the running balance is the oracle.** It is used to (a) choose which
money column is the balance column, (b) flip the sign on debits that are printed
unsigned, and (c) detect dropped rows, because a missing transaction breaks the chain
at that point.

---

## 3. Measured result

Two corpora.

**Synthetic (self-generated, 14 layouts): 100% recall, 100% precision, 100% reconciliation.**

**Real (11 publicly published sample statements from bank-owned domains, 7 countries):**

| Statement | Pages | Rows found | Balance chain | Notes |
|---|---|---|---|---|
| Sparkasse (DE) | 2 | 12 | **0%** | rows found, balance column not identified |
| Postbank (DE) | 2 | 12 | 33% | date/year stacked on two baselines |
| Schwyzer Kantonalbank (CH) | 1 | 3 | 50% | multi-line entries with payment-slip detail |
| Capital One (US) | 1 | 5 | **100%** | the only publishable one |
| Commerce Bank (US) | 1 | 5 | 0% | summary/total rows interleaved with transactions |
| BCP (BO) | 2 | 0 | — | |
| lafinancepourtous (FR) | 1 | 15 | 0% | may be an explanatory guide, not a real table |
| Banco de Portugal (PT) | 3 | 0 | — | regulatory text, not a statement (expected) |
| bancop (PY) | 1 | 19 | 0% | credit-card statement, no running balance |
| 2 image-only PDFs | — | refused | — | correct behaviour, not a failure |

**1 of 11 is publishable. 9 parse to something. 2 are correctly refused.**

The synthetic corpus was a mirror of my own assumptions — I wrote the generator with the
same mental model as the parser. It validated the implementation, not the approach. That
is a methodological error, and it is the most important thing learned so far.

---

## 4. The four failure classes, with evidence

### 4.1 Vertically stacked fields (Postbank)

The date and the year are drawn on **different baselines** to save horizontal space:

```
p1 y=421  [MMTTM]  23.05.  20.04.  SEPA Lastschrifteinlass bei  +100,00
p1 y=433  [MMT  ]  2023    2023    Marc-x Postbank
```

So the logical field `23.05.2023` is split across two visual rows. My row model has no
concept of a field spanning baselines. A partial fix (accept a trailing separator in a
date) lifted this statement from 0 to 12 rows, but the year is still stranded.

### 4.2 Multi-line entries (Schwyzer Kantonalbank)

One logical entry occupies up to 5 visual rows — the transaction line, then address and
payment-reference lines, some of which contain their own dates:

```
p1 y=425  [DTDMM]  04.09.19  Postcheckeingang  04.09.19  3'477.00  48'671.25
p1 y=435  [T    ]  Ausgleichskasse des
p1 y=446  [T    ]  Kantons Schwyz
p1 y=467  [T    ]  (AHV-Nr.) Hans Muster
p1 y=491  [T    ]  RE 1567 EL1910
p1 y=501  [T    ]  (AD_2011 00111122)001100111111
```

My rule is "a row is a new entry iff it has a standalone date cell". Continuation lines
here are detail, but the layout family also puts *dates inside* continuation lines (value
dates, delivery dates, reference dates), so the rule is not safe in either direction.

### 4.3 Mutually exclusive columns (Sparkasse)

The statement has two money columns where **only one is populated per row**, plus a
balance that is printed only on some rows:

```
p1 y=331  [TTTTTT]  Datum  Erläuterung  Betrag Soll EUR  Betrag Haben EUR
p1 y=346  [TWM   ]  Kontostand am 30.09.2021, Auszug Nr. 9        40,68
p1 y=360  [TM    ]  01.10.2021  Lastschrift                     -790,00
p1 y=382  [TM    ]  01.10.2021  Zahlungseingang                 1.752,37
```

Consequences: a right-edge cluster for either column may fall below the `min 2 members`
filter, and the balance column (`Kontostand`) is a *label-value* line rather than a
column, so my per-row balance oracle has no data to work with on most rows.

### 4.4 Summary blocks interleaved with data (Commerce Bank)

```
p1 y=271  [TM]  Beginning Balance on May 3, 2003        $7,126.11
p1 y=281  [TM]  Deposits & Other Credits                +3,615.08
p1 y=323  [TM]  Checks Paid                             -200.00
p1 y=343  [TM]  Ending Balance on June 5, 2003         $10,521.19
...
p1 y=430  [TM]  Total Deposits & Other Credits          $3,615.08
```

Some of these lines have a label, an amount and a running balance, so they look like
transactions to every signal I use — and they *break the arithmetic* of the real
transaction chain. I have a keyword blocklist (`^(beginning|opening|total|…)/i`), which
is exactly the kind of brittle, per-layout hack that does not generalise.

---

## 5. The architectural tensions

These are the reasons I do not believe this is "fix the bugs and move on".

**T1. The oracle requires a balance on every row; many real statements do not provide
one.** My entire column-role selection, sign correction and error detection depend on
`prev + amount = balance` holding across consecutive rows. German statements often print
`Kontostand` only as a labelled line at intervals. Where the oracle is unavailable, so is
the design.

**T2. "Row" is the wrong unit.** At least three of four failure classes are 2-D grid
problems (stacked fields, multi-line entries, side-by-side label/value). I built a 1-D
pipeline (cluster y → cluster x) on top of a document that is a 2-D lattice with
irregular structure.

**T3. Heuristic layering has an unbounded bug surface.** Six bugs surfaced from eleven
statements, all found by hand, each fixed with a targeted rule. Real-world bank layouts
number in the thousands and change without notice. There is no evidence this converges,
and I cannot measure convergence: I have 11 statements and no way to estimate coverage.

**T4. The differentiator is in tension with the requirement.** Client-side execution is
the product's whole reason to exist (privacy, zero cost, works offline). Client-side also
means no learned layout model, which is where generalisation across arbitrary layouts
normally comes from. That is the actual dilemma.

---

## 6. Options I can see

**A. Keep hardening the geometric parser.**
Cheap, preserves every constraint. Unbounded bug surface, impossible to estimate
coverage. Currently yielding roughly one bug per two statements.

**B. Move extraction to a server-side document/vision model.**
Generalises. Destroys constraint 1 (privacy claim, CSP, the browser test), and adds
per-conversion cost and a queue. Would also invalidate the "no upload" copy, the privacy
policy, and the CSP that currently *enforces* the claim.

**C. Narrow the promise to what demonstrably works.**
Publish only tested layouts; be explicit that coverage is partial. Honest and preserves
everything, but shrinks the addressable market, and I cannot know which banks users
actually hold without data I do not have.

**D. Rebuild the parser around a 2-D table lattice.**
Global row grid and global column grid computed over the whole document (not per page),
then assign cells to lattice positions; treat multi-line entries as cell spans. This is
closer to classical table-structure recognition. Preserves all constraints; is a rewrite
of the core; does not by itself solve T1 or T4.

**E. Turn the balance chain from a check into the objective function.**
Instead of heuristically picking a column model and then verifying it, search over
candidate parses — (column boundaries × role assignment × row grouping) — and choose the
one that explains the most of the balance chain. The chain is a very strong signal and is
currently under-used: it is a *constraint satisfaction* signal, not a *scoring* signal.
Tractable if the search space is bounded (it is small: a handful of columns, a few role
permutations, a few row-grouping policies). Does not solve T1 (statements with sparse
balances) and does not solve T4.

**F. Make the synthetic corpus adversarial and iterate against it, holding the 11 real
statements as a holdout.**
Now that I have ground truth about how real layouts differ, the generator can synthesise
stacked fields, multi-line entries, mutually exclusive columns and interleaved summary
blocks on demand. Fast iteration, no dependency on acquiring more real documents, and the
holdout keeps me honest. This is an *enabler* for A/D/E rather than an alternative to them.

---

## 7. What I actually want to know

1. Is T4 real — is there a known way to get robust table extraction from bank statements
   that runs **in-browser, offline, with no model download and no server**, or is the
   client-side constraint fundamentally incompatible with the accuracy requirement?
2. Given ~9 instrumented failures across 11 statements, is the pattern consistent with
   "the architecture is wrong" or with "the implementation is young"? What would
   distinguish those?
3. Is option E (parse-as-constrained-search with the balance chain as the objective) a
   recognised approach with a name and known results, or should I not bother?
4. How should I *measure* coverage and expected accuracy given I cannot obtain customer
   statements at scale and the samples available are few (2 of 11 were image-only, and the
   public corpus is thin)? What is the smallest experimental design that would tell me
   whether this approach can reach, say, 80% of real statements?
5. Is there a public corpus of real bank statement PDFs used in table-extraction research
   that I have not found?
6. If the answer is "serve fewer layouts honestly" (option C), how would you decide which
   layouts are worth targeting without access to user data?

---

## 8. What is demonstratively working, so it is not lost in a rewrite

- The alignment of claim and enforcement: CSP + a browser test that fails any external
  request during conversion, so "nothing is uploaded" is machine-checked.
- Balance-chain verification, which turns silent wrongness into visible flags, and which
  refuses image-only PDFs rather than inventing rows.
- Output that is correct for the market: per-locale decimal separator, CSV delimiter,
  date format and digit grouping (including Indian lakh/crore), with tests asserting that
  a comma-decimal locale gets a semicolon-delimited file.
- A regression harness with two corpora and a baseline that fails on any deterioration,
  plus `inspect:statement` for seeing exactly what the parser saw.
