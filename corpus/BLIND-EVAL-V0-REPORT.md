# Exploratory Blind Evaluation v0

## 1. Frozen parser snapshot

```
commit:      9a047d4  (frozen; working tree clean at run time)
beam width:  40000      (known empirical, not derived — held fixed anyway)
role cap:    MAX_ROLE_TOKENS_PER_LINE = 5
min conf:    0.55
lookback:    DATE_LOOKBACK_LINES = 2
thresholds:  minDetailScore 0.35 | minChainScoreGap 0.15
weights:     dateCoverage 1 | datedAmountCoverage 0.6 | entryCount 0.15
ran:         2026-09-14, one batch, all eight statements
```

Per-file SHA-256 of every `parse2` source is recorded in
`corpus/blind-eval-v0-manifest.json`. **No parser file was modified before, during
or after this run.** The manifest and the runner were committed before the run.

## 2. Results

| ID | Nature | Status | Correct chain found | Verified correct | Classification |
|---|---|---|---|---|---|
| A03 | official_sample | `verified` | yes, but not selected | **no** | **FALSE_ACCEPT** |
| A04 | official_sample | `verified` | yes, but not selected | **no** | **FALSE_ACCEPT** |
| A05 | official_sample | `verified` | yes, and selected | yes | VERIFIED_CORRECT |
| S02 | **real** | `partial` | yes, not selected | no | PARTIAL_CORRECT_CHAIN_PRESENT |
| G01 | official_sample | `partial` | yes, not selected | no | PARTIAL_CORRECT_CHAIN_PRESENT |
| C05 | **real** | `partial` | no | no | MISSED_PARSE |
| C06 | **real** | `partial` | no | no | MISSED_PARSE |
| C10 | **real** | `partial` | no | no | MISSED_PARSE + `SEARCH_COMPLEXITY` |

### What the two false accepts actually are

```
A03  ground truth   20,649.65 -> 20,835.37   (6 amounts: 402.72, -217.00, ...)   score 0.5061  not selected
     selected          217.00 ->     29.02   (1 amount:  -187.98)                score 0.9229  VERIFIED

A04  ground truth        6.97 ->      7.08   (2 amounts: 13.68, -13.57)          score 0.0171  not selected
     selected            0.12 ->     14.63   (2 amounts: -0.12, 14.63)           score 0.9314  VERIFIED
```

Both users receive a `verified` CSV containing **one or two invented transactions**
instead of their statement. In A04 the correct chain scored **0.017** and the wrong
one **0.931** — a factor of 54.

## 3. Metrics

```
                   N   VERIFIED  FALSE    PARTIAL   SAFE     MISSED   VerifiedSafe  Recoverable  FalseAccept
                       CORRECT   ACCEPT   CORRECT   REFUSAL  PARSE    Coverage      Coverage     Rate
Overall            8      1         2        2         0        3       12.5%         37.5%        66.7%
Real only          4      0         0        1         0        3        0.0%         25.0%        N/A (0 verified)
Official sample    4      1         2        1         0        0       25.0%         50.0%        66.7%
```

`N = 8 is far too small for a coverage estimate.` These numbers describe this version's
behaviour on this set and nothing more.

## 4. Failure attribution

**A03, A04 — CHAIN_SELECTION_FAILURE.** Direct evidence: in both, a chain matching
the ground-truth balance span was present and scored *lower* than the selected chain.
The selection objective chose against it. This is not an extraction or accounting
failure — the correct chain was found and reconciled.

**Root cause visible in A04's numbers.** The correct chain's detail score is 0.0171,
the near-lowest possible, because its two amounts carry no transaction date. The
selected chain's amounts do. So `dateCoverage` — the signal introduced specifically to
distinguish ledger from summary — is what *selected the wrong chain*. The signal is
inverted in its effect here, and `entryCount` and `datedAmountCoverage` reinforce it.

**S02, G01 — AMBIGUITY_REFUSAL.** Correct chain present among candidates, not selected,
status `partial`. Safe: nothing wrong was certified. S02 surfaced 28 candidate chains
with a 0.009 score gap — the selection layer had nothing decisive to work with.

**C05, C06, C10 — CANDIDATE_GENERATION_FAILURE.** No chain matching the ground-truth
balance span was produced at all. For C06 the best chain was
`227,060.36 -> 397.61` with 19 amounts; the real span `200,000.00 -> 63,343.68` never
appeared. These documents print `opening + credits - debits = closing` in a summary
block and list the transactions separately, so the correct chain must be assembled
*across* two structures — which is exactly the cross-chain subtotal work that was
deferred. All three are `opening_closing_only` balance structures.

**C10 — SEARCH_COMPLEXITY.** 305.9s against a 300s per-file budget. The decisive
observation is that **the two slowest real statements (C10 at 306s, S02 at 116s) are
also the ones that failed to produce a correct chain**, while the fast official samples
completed in 3–8s. Search cost and failure are correlated here, so search
approximation cannot be ruled out as a contributing cause for C05/C06/C10.

**Search pruning vs search approximation:** not separable in this run. Beam internals
were not instrumented, because doing so would mean editing the frozen parser. A
post-hoc diagnostic on a copied snapshot can answer it; this report does not.

### Harness defect found (not a parser defect)

The batch driver reported C10 as `timeout`, but the worker actually completed at
305.9s and wrote its real result. `SIGKILL` to the `npx vite-node` wrapper does not kill
the grandchild, so the child wrote over the driver's timeout record. **C10's outcome is
`completed, 305.9s, over budget`** — recorded as `SEARCH_COMPLEXITY` because it
exceeded the budget, not because it was killed. The driver needs a process-group kill.

## 5. Architecture verdict

# No-Go → Architecture Review

Two independent triggers, either of which is sufficient:

1. **`FALSE_ACCEPT = 2`**, at or above the pre-declared threshold. Both are
   `official_sample` documents, both returned `verified`, both would hand a user a
   wrong CSV. No accounting constraint was violated in either case — which is the
   point: **arithmetic self-consistency is not verification**, and this run shows the
   layer built to bridge that gap currently selects against the truth.

2. **`0 of 4` real statements produced a verified-correct result.** Verified Safe
   Coverage on real documents is 0%. The four real statements either produced no
   correct chain (3) or refused to choose between 28 of them (1).

The pre-declared framework said this outcome means: *pause, and re-evaluate
verification semantics, chain selection, the search objective, and whether there are
structures that the current evidence cannot distinguish.*

That is the correct reading. Concretely, this run provides evidence for three things
that were previously hypotheses:

- **The date-coverage signal is not just weak, it is inverted in effect.** It was
  introduced to distinguish a ledger from a summary and it demonstrably selected
  against the ledger. Any redesign has to start from that measurement.
- **The summary→detail structure is the common failure across all four real
  statements.** Every real document failed on documents whose correct chain must be
  assembled across a summary block and a detail block.
- **The accounting model is sound but insufficient.** 27/27 constraints passed on C06
  while the correct chain was never generated. Passing constraints says nothing about
  whether the right chain was found.

## 6. Next experiment

**One thing: determine whether the four real-statement failures are search
approximation or candidate generation.**

Run the frozen snapshot unchanged on copies, with beam width raised (40k → 200k →
unbounded) on C05, C06 and C10 only, recording whether the ground-truth balance span
appears among the candidates. This is a post-hoc diagnostic on copies — the v0 result
above stands and must not be overwritten — and it separates two completely different
remedies:

- if the correct chain appears at higher beam width → **SEARCH_PRUNING_FAILURE**, and
  the fix is search efficiency, not model.
- if it never appears at any width → **CANDIDATE_GENERATION_FAILURE**, and the fix is
  the deferred cross-chain subtotal structure.

Do not change the parser, the weights, the thresholds or the objective until that is
known. And do not add a fifth scoring signal: this run is evidence that adding signals
to the selection objective is how the false accepts were produced.

## 7. Corpus status

Per the pre-declared rule, these eight files have now been seen and **lose blind
status immediately**. All eight move to the regression corpus, including the failures —
a blind failure is the most valuable fixture there is. Any future coverage claim
requires statements that have never been run.
