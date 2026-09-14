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

## Addendum: the falsification experiment, and what it actually showed

The recommendation was to make `verified` strict enough that the identified false
acceptance fails, and to treat a failure to do so as evidence against the approach.
Two objective terms were added:

- **Isolation cost.** Reading an *isolated* figure as a transaction now costs in
  proportion to how little support its column gives it. Every real transaction
  amount lines up with several others; a figure that lines up with nothing does not.
- **Evidence-scaled constraints.** A balance constraint is now worth as much as the
  figures it chains: `(W_CONSTRAINT + W_SPAN·span) × min(anchorSupport, meanAmountSupport)`.
  A chain of isolated figures scores near zero however exactly it balances.

### Result: one fixed, and one mis-diagnosis corrected

**Capital One — fixed.** The three spurious summary figures are gone. The chain is
now exactly the ledger:

```
PASS  1186.93 -> 1189.42   delta 2.49
PASS  1189.42 -> 1191.67   delta 2.25
PASS  1191.67 -> 1194.17   delta 2.50
PASS  1194.17 -> 1194.17   delta 0.00      (closing)
amounts: 2.49, 2.25, 2.50                  (was 6 amounts including three summary figures)
```

Sparkasse likewise lost its one spurious amount and now holds exactly the twelve
real transactions. Postbank moved from `unsupported` to `verified`.

**Commerce Bank — not a false acceptance at all.** I had mis-diagnosed it. Its
`Beginning Balance / Deposits & Other Credits / ATM Withdrawals / Checks Paid /
Ending Balance` block is a *genuinely valid* balance chain:

```
7126.11 + 3615.08 − 20.00 − 200.00 = 10521.19   ✓ exactly the printed ending balance
```

So the decoder was not wrong. It found a second, equally consistent chain, in the
same document, and reported it. The real problem is **chain selection**, not
verification:

> `verified` currently means "these figures form a consistent balance chain".
> A statement can contain several such chains — a summary and a ledger — and the
> user wants the ledger.

### Corpus after the change

```
verified 6   unsupported 3   refused 2      balance constraints 19/19 satisfied
```

(`verified`: Schwyzer KB, Postbank, Sparkasse, lafinancepourtous, Capital One,
Commerce Bank.)

### What this means for the recommendation

The architecture still holds up: the change removed a real false acceptance without
losing a single correct chain, which is the direction the objective needed to move.
But the verification definition is **still not publishable**, for a different reason
than before. The remaining work is not "make the arithmetic stricter" — it is
**choose the right chain**, and there are three generic signals for that, none of
which is a keyword list:

1. **Dated entries.** The ledger's entries carry dates; a summary block's do not.
   This is the strongest and cheapest signal, and chronology is currently unused.
2. **Entry count.** A ledger has many entries; a summary has a handful of
   category totals.
3. **Subtotal structure.** A summary chain's amounts are *sums of the ledger's*
   amounts — a detectable relationship, and the most principled of the three
   because it explains the document rather than describing it.

Until chain selection is resolved, `verified` must not be published, and the honest
output for a multi-chain document is `partial` with both chains surfaced so the user
can pick — which is the fail-closed behaviour the brief asks for in §16.

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

---

## Stage 3: chain selection (`reconciled` ≠ `verified`)

The previous stage's conclusion was that the remaining problem had changed shape.
It had:

> `verified` meant "these figures form a consistent balance chain". A statement can
> hold several such chains — a summary and a ledger — and the user wants the ledger.

So `verified` is now a **statement-level judgement**, not an arithmetic one:

```
reconciled   these figures form an arithmetically consistent chain
verified     ...and this is the transaction detail, and no equally plausible
             alternative explanation exists
```

Two stages, deliberately not sharing a score:

```
lib/parse2/
  tokens.ts                 extraction   — 2-D token graph
  amounts.ts, dates.ts      candidates   — readings with evidence and confidence
  lines.ts                  candidates   — the decoder's input sequence
  decode.ts                 reconciliation — which readings are self-consistent?
  chain-selection/          selection      — which of those is the transaction detail?
```

Arithmetic is the **gate** into selection, never a term in it (brief §8). Every
candidate already reconciles, so scoring it again on arithmetic would just let the
cleanest summary win — which is precisely the failure that started this.

### Evidence

`dateCoverage` and `datedAmountCoverage` (value-weighted), plus a weak `entryCount`
term, in the priority order the brief requires. Entry count is last because "the
ledger has more rows" is a tendency, not an invariant: a statement can have eight
summary categories and four transactions.

Dates come from the existing `DateCandidate` path, never a fresh regex over the
line. An amount counts as dated if its own line carries a date, or a date sits
within `DATE_LOOKBACK_LINES = 2` lines above it *and* no amount intervenes — which
is what makes a multi-line entry work without making a section header count.

### Result on the regression corpus

```
verified 5   partial 4   refused 2      19/19 balance constraints satisfied
```

| Statement | Accounting stage | After chain selection |
|---|---|---|
| Capital One | verified | **verified**, gap 0.94 — amounts 2.49, 2.25, 2.50 preserved |
| Sparkasse | verified | **verified**, gap ∞ — the 12 transactions preserved |
| Schwyzer KB | verified | **verified** |
| lafinancepourtous | verified | **verified** |
| Commerce Bank | verified | **verified**, gap 0.63 |
| Postbank | verified | **partial**, gap 0.01 — two genuine chains |
| bancop | verified | **partial**, INSUFFICIENT_DETAIL_EVIDENCE |
| BCP, Banco de Portugal | unsupported | **partial**, NO_RECONCILED_CHAIN |

### Three defects found by building this

1. **An amount spanned by no constraint counted as a chain entry.** A Capital One
   parse consumed the closing-balance row as a trailing amount, which made the
   correct chain look ambiguous *with itself* — a 0.009 gap driven entirely by the
   entry-count term rewarding the extra fake entry.
2. **Chains were identified by their anchors, not by their transactions.** Two
   parses that extract the same amounts over the same balance span are the same
   answer to the user even if one also anchored on a closing row. Signing on
   anchors reported statements as ambiguous with themselves.
3. **Alternatives were mined from any beam state.** A parse scoring far worse still
   contains chains, and those can look well-dated, so the ambiguity check fired on
   statements with a single sensible reading (Sparkasse fell to `partial`). Only
   parses within `max(6, 12% of best)` are now treated as competing interpretations.

Defect 1 is the fail-closed principle applied at the right level: unverified
arithmetic must not become evidence, and must not reach the output.

### Commerce Bank is still not right, and it is not a chain-selection problem

The selected chain (`75.00 → 305.00`, 2 entries) is a category subtotal. The
**transaction ledger is not in the candidate set at all** — the decoder discards it
because the summary explains the arithmetic more cheaply. Chain selection cannot
choose something that was never generated.

This is brief §16 condition D. Resolving it needs the cross-chain subtotal
relationship (`chain A's amounts are sums of chain B's`), which was explicitly
deferred from this round.

## Freeze assessment: `Blind Evaluation Candidate v0` — **not met**

Two conditions are unmet:

1. **Commerce Bank is unresolved.** Its detail ledger must become a candidate before
   selection can pick it. That is the deferred subtotal work.
2. **Postbank and bancop were reclassified**, from `verified` to `partial`. Postbank's
   ambiguity looks genuine (two fully-dated reconciled chains, 0.931 vs 0.923), which
   means the earlier `verified` was over-confident — but "the new answer is more
   honest" and "the new answer is right" are different claims, and this has not been
   checked against ground truth.

Also note the shape of the numbers: **`partial` is now 4 of 11, and that is the honest
number, not a regression.** The verification definition got stricter, and stricter
definitions reduce coverage. Reporting `verified 5` while one of them is wrong would
be worse than reporting `partial`.

Freeze the weights and thresholds only after Commerce Bank is resolved and the
reclassifications are checked. Thresholds in force:
`minDetailScore 0.35`, `minChainScoreGap 0.15` (`chain-selection/select.ts`).


---

## Stage 4: the Commerce Bank case is invalid as a target

Chasing the "candidate set fix" for Commerce Bank turned up something that
invalidates the case, and it is worth stating plainly because a lot of this
prototype's recent direction was aimed at it.

**The specimen does not reconcile with itself.**

```
SUMMARY                                 DETAIL
Beginning Balance      7126.11
+ Deposits & Other     3615.08          Deposit             3615.08
- ATM Withdrawals        20.00          05-18 $20.00          20.00
- Checks Paid           200.00          05-12  75.00
                                       05-18  30.00
                                       05-24 200.00
                                       Total Checks Paid    305.00
= 10521.19  (matches printed close)
```

The summary balances exactly. The detail block is internally consistent — 75 + 30 +
200 = 305. But 305 ≠ 200, so **no transaction ledger reproduces the printed ending
balance**. Off by exactly 105.00, the two smaller checks.

So "make chain selection pick the detail chain" is not a solvable problem: there is
no consistent detail chain to pick. My previous framing — *the decoder discards the
ledger on accounting grounds* — was the wrong diagnosis.

### The false acceptance is nevertheless real, and now understood

Commerce Bank is reported `verified` on a chain built from its checks section:

```
opening anchor  75.00   (a check amount, column c7)
amounts         30.00, 200.00   (the other checks, same column c7)
closing anchor  305.00  (the category total, column c14)
```

75 + 30 + 200 = 305, so every constraint holds. **A transaction is being read as an
opening balance.** That is the mechanism, and it is the same class of defect as the
earlier ones: arithmetic that is satisfied by misreading the document's roles.

### Three attempts to gate on column structure, all wrong

| Rule | Result |
|---|---|
| all anchors share one column | broke Schwyzer KB and lafinancepourtous |
| no anchor shares the amounts' column | broke Sparkasse, Postbank, lafinancepourtous |
| both together | strictly worse |

The reason is factual, not a tuning failure: **on a real statement the balance is
often printed in the same right-aligned column as the transactions.** A single
`Betrag` layout puts every figure on one right edge, so column identity cannot
separate a balance reading from an amount. Any rule built on it discards correct
chains, which is worse than the false acceptance it was meant to catch.

The rule has been reverted and retained only as a diagnostic (`anchorColumns`).

### Why this is a stopping point rather than a prompt for a fourth rule

Three failed formulations on one document is overfitting in progress. The brief
forbids exactly this (§21 "do not keep adding signals", §23 "do not keep tuning
against the regression corpus"), and this document cannot supply ground truth
anyway. A fourth rule invented here would be fitted to a specimen whose correct
answer does not exist.

**The discriminator needed is not derivable from what is in these 11 files.** It
requires either statements that do reconcile, or a signals set this layer does not
have (for example a genuine "this line is a balance readout" signal from layout
repetition across pages, which needs far more documents to calibrate).

## Freeze assessment: still not met, and the reason is different again

```
verified 5   partial 4   refused 2     19/19 constraints satisfied
```

- Capital One, Sparkasse, Schwyzer KB, lafinancepourtous verified — no regression.
- Postbank `partial`, gap 0.01: two fully-dated reconciled chains. Genuine ambiguity.
- Commerce Bank `verified`: a **known false acceptance** with an understood mechanism
  and no available fix.
- BCP and Banco de Portugal `partial / NO_RECONCILED_CHAIN`.
- bancop `partial / INSUFFICIENT_DETAIL_EVIDENCE`.

`Blind Evaluation Candidate v0` is not frozen, for one reason that matters more than
the others: **there is a known false acceptance in the corpus and I have no
evidence-backed way to close it.** Freezing weights around it would bake it in.

The next step is not another rule. It is more statements — specifically statements
whose own figures reconcile, since a corpus that cannot supply ground truth cannot
validate a fix.


---

## Stage 5: expanding the corpus exposed a scaling bug and a brittle parameter

The bottleneck was never parsing more documents — it was **finding documents worth
parsing**. Searching Bing (DuckDuckGo's `filetype:` index is too thin) for
bank-published and institution-published samples, then decoding the `u=` redirect
parameter, produced seven usable files. Results across 19 documents:

```
verified 6   partial 10   refused 3     85/85 balance constraints satisfied
```

### A dense line hung the decoder outright

`us-bankofamerica-howtoread.pdf` — a Bank of America "how to read your statement"
guide — put **34 money figures on a single line**. Line expansion enumerates role
combinations per figure, so that line alone was 4^34 branches. The first corpus run
timed out at 20 minutes.

Two fixes: figures beyond the best five on a line keep being *charged* as
unexplained but may not take a role (a transaction row has one to three figures;
thirty is a dense layout), and the per-line ranking is computed once instead of on
every recursion step. The corpus now decodes in about four minutes.

The refusal itself is correct behaviour: the guide produced **16 chains** and the
ambiguity detector declined to verify any of them, gap 0.03.

### The beam width is load-bearing, and that is not a good sign

Reducing live states from 120,000 to 12,000 for speed **silently lost the correct
chain for `fr-lafinancepourtous`** — a real French statement went from `verified` to
`NO_RECONCILED_CHAIN`. At 20,000 it still failed. At 40,000 it returns.

So the decoder is not solved, it is *tuned to a size that happens to work for these
19 documents*. That is exactly the state the brief warns against freezing, and it is
recorded here rather than buried in a constant.

### What the new documents actually are

Of seven downloads, five are **fabricated samples** — university admissions offices,
a city government, a document-tools vendor — and produce no chain at all. That is
the parser behaving correctly on documents that contain no consistent ledger.

The bottleneck for evaluation is therefore **corpus admission, not parsing**: a
usable statement must be one whose own figures reconcile, and most public "samples"
are illustrations rather than statements. Commerce Bank remains the clearest proof:
it was in this corpus for three stages as the key regression case, and it is a
document with no consistent ledger.

### Corpus admission filter — proposal, not implemented

The check that would have caught Commerce Bank on arrival, and that did catch it
late, is arithmetic rather than keyword:

```
admit a document only if SOME reconciled chain spans >= 2 amounts and >= 80% of
those amounts are dated
```

Commerce Bank's summary chain spans 3 amounts and is 0% dated; its dated chains span
2 amounts but reconcile only by reading a transaction as an opening balance. Neither
satisfies the rule. It is not implemented because it would be a fifth rule fitted to
the one document known to violate it — the same overfitting the previous stage
stopped on.

## Where this leaves the freeze

Still not frozen, now for three recorded reasons:

1. **A known false acceptance** (Commerce Bank) with no evidence-backed fix.
2. **A parameter that is tuned, not derived** — the beam width changes whether a real
   statement verifies.
3. **A corpus that mostly cannot supply ground truth** — five of seven new documents
   are fabricated samples, and one of the eleven original ones is internally
   inconsistent.

The next step is corpus, not code: find statements whose own arithmetic reconciles,
with enough layout diversity to be worth calling a blind set.
