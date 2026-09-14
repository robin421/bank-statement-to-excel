# Prototype: sparse balance constraint decoding

**Status: isolated prototype. Nothing here is wired into production.** The existing
parser and all 128 of its tests are untouched, and the browser/privacy guarantees
are unaffected because this code is not imported by any page.

The brief asked for one experiment before committing to a rewrite:

> implement and validate the `Sparse Balance Constraint Decoder` against the real
> regression corpus, and judge whether it significantly improves sparse-balance,
> summary-interleaving and sign-selection scenarios.

It does. It also produced a false acceptance, which is the more important finding.

---

## The idea

The production parser verifies `previous_balance + amount == balance` on
**consecutive rows**, so it needs a balance on every row. Many real statements do
not provide one — a Sparkasse statement prints `Kontostand` at the start and the
end and nowhere between — so the check has nothing to work with exactly where it
matters.

The general form is a sum over an interval:

```
B[j] - B[i]  ==  Σ  ±amount[k]        for i < k < j
```

Two anchors anywhere then constrain every amount between them. Three consequences,
and they are the whole point:

1. **Sparse balances become usable instead of fatal.**
2. **A summary row cannot be admitted.** `Deposits & Other Credits +3,615.08` looks
   geometrically identical to a transaction, but including it breaks the sum. The
   arithmetic rejects it — no keyword list, no `/^(beginning|opening|total)/`.
3. **An unsigned debit column has its sign settled** by which assignment makes the
   sum work, rather than by which column it happens to sit in.

## Result on the real corpus

| Statement | Production parser | Prototype |
|---|---|---|
| Sparkasse (DE) | 12 rows, **0%** reconciled | **verified** — one constraint spanning 22 lines, exact to the cent |
| Schwyzer Kantonalbank (CH) | 3 rows, 50% | **verified** — 3 constraints |
| Capital One (US) | 5 rows, 100% | **verified** — 5 constraints (and see below) |
| Commerce Bank (US) | 5 rows, **0%** | **verified** — 4 constraints |
| lafinancepourtous (FR) | 15 rows, 0% | **verified** — 2 constraints |
| Postbank (DE) | 12 rows, 33% | unsupported (all chains too short to be evidence) |
| bancop (PY) | 19 rows, 0% | unsupported (ditto) |
| BCP (BO), Banco de Portugal (PT) | 0 rows | unsupported |
| 2 image-only PDFs | refused | refused |

```
production:  1 publishable statement
prototype:   5 verified,  22/22 balance constraints satisfied
```

### The Sparkasse case, which is the hardest one

Twelve transactions, no running balance between the opening and the closing, and
four decoy numbers in the text (`1.000,00`, `12.34`, `14.39.17`, a reference).
The decoder produced one constraint over a 22-line gap:

```
PASS  40.68 -> 231.33   delta 190.65   computed 231.33   L5..L27
```

`12.34` and `14.39.17` were rejected by the arithmetic alone. That is the
no-keyword-list property the brief required, demonstrated on the case that
motivated it.

---

## The false acceptance — the finding that matters

**`us-capital-one` is marked `verified` and its parse is wrong.**

The sample contains two independent balance chains: a savings summary near the top
(`194.17`, `1194.17`, `7.24`) and the activity ledger below
(`1186.93 → +2.49 → 1189.42 → …`). The decoder's winning parse contains the
correct ledger chain *and* a spurious summary chain in which three summary figures
are read as transactions. Every constraint holds; the parse is still not the
statement's transactions.

So `verified` currently means **"the arithmetic is self-consistent"**, which is
not the same as **"these are the transactions"**. Three separate defects had to be
fixed before the ledger chain even came out right, and each one is a class of bug:

1. **A constraint could be bought.** A satisfied constraint paid `+100` while a
   contradiction cost only `-45`, so the search admitted a failing anchor to reach
   a passing one. Removed: a constraint that does not hold may not be admitted at
   all, and a balance reading that does not continue the current chain must start
   a new chain instead. This alone flipped Capital One's ledger from wrong to
   exact.

2. **Money tokens could be dropped for free.** Lines were processed one token at a
   time, so when `$2.49` was consumed its sibling `$1,189.42` on the same line was
   silently discarded and never charged as unexplained — which is what let a parse
   that ignored half the page report `unexplained = 0.06`. Lines are now processed
   as a unit and every token is either consumed or charged.

3. **State was copied per branch.** Cloning the decision history made a
   sixteen-amount gap cost 65,536 array copies and forced the beam below the size
   the search needs. States are parent-linked now.

Defects 1 and 2 were **false-acceptance** bugs, not accuracy bugs: both made a
wrong parse look clean. That is the failure mode the product cannot have.

---

## What is *not* solved

- **False acceptance is not zero and is not measured.** `verified` needs a stricter
  definition before any of this is publishable: token coverage relative to
  high-confidence money, a penalty for chains that cross a section boundary, and a
  check that the parse does not require reading a figure as an amount when the same
  magnitude appears elsewhere as a balance.
- **Chronology is unused.** A summary block read as a transaction usually produces
  non-monotonic dates; that is currently not part of the objective.
- **Ambiguity is not detected.** The brief asks for a `scoreGap` between the best
  and second-best parse. The beam merges states, so the runner-up is not yet
  retained.
- **Description and date association is not implemented.** The prototype decodes
  amounts and balances; grouping them into dated transactions is Phase 2 work that
  has not been done.
- **Two statements remain `unsupported`** with all chains too short to be evidence.
  That is fail-closed and correct, but it is also lost coverage.

---

## Files

```
src/lib/parse2/tokens.ts     2-D token graph. Word-level tokens (a merged run was
                             the bug that made Sparkasse parse to zero rows), and
                             tolerances measured from the document's line pitch
                             rather than a fixed ROW_TOLERANCE.
src/lib/parse2/amounts.ts    Money readings with evidence and confidence instead
                             of a boolean. Rejects anything that reads as a date
                             (`20.10.2021` was silently 2010.20).
src/lib/parse2/dates.ts      Date readings plus document year/order context.
src/lib/parse2/lines.ts      Line events — the decoder's input sequence.
src/lib/parse2/decode.ts     The decoder. This is the experiment.
scripts/decode2.ts           Harness: verdict per statement over the corpus.
scripts/seq-money.ts         The money sequence and column evidence.
```

## Running it

```bash
npm run decode2 -- --corpus                              # whole real corpus
npm run decode2 -- fixtures/real/de-sparkasse-….pdf --verbose
npm run seq:money -- fixtures/real/x.pdf --lines
```

## Recommendation

The architecture is worth continuing. It fixed the three scenarios the brief named,
on statements the current parser scores at 0%, using no bank-specific rules and no
keyword blocklist. But the next step is **not** more decoding — it is making
`verified` strict enough that the Capital One false acceptance fails. A prototype
that accepts wrong parses at an unknown rate is worse than one that refuses.

Cheapest next experiment, in order:

1. **Token-coverage and chain-boundary penalties** in the objective, then re-run the
   corpus and check that Capital One's summary chain disappears. If it does not,
   `verified` cannot be trusted and the approach needs rethinking.
2. **Retain the runner-up parse** so ambiguity can be reported as a score gap.
3. **Hold out new statements.** The 11 real files have already shaped the design, so
   they can only serve as regression, never as evidence of coverage. Real evaluation
   needs statements that have never been looked at.
