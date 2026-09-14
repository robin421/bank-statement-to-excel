# Post-hoc Search Diagnosis v1

Diagnostic only. **Blind Evaluation v0 (commit `4c625e4`) stands unchanged** — the
artifacts in `artifacts/blind-eval-v0/` were not overwritten, recomputed or
reinterpreted. Nothing here is a blind result and nothing here is a coverage number.

The parser's candidate generation, constraints, evidence scaling, chain selection,
weights and thresholds are **unchanged**. The only additions are a read-only trace hook
and a harness fix, both described below.

Scope: `C05`, `C06`, `C10` — the three statements where the correct chain never reached
the final candidate set. `A03`/`A04` (`CHAIN_SELECTION_FAILURE`) and `S02`/`G01`
(`AMBIGUITY_REFUSAL`) are out of scope by the brief.

---

## 0. Instrumentation is provably behaviour-neutral

A `trace` option was added to `decode()` that observes the beam and cannot alter it. It
is `undefined` in production and in every regression run. Proven by re-running
statements with `trace` off and diffing against the immutable v0 artifacts:

```
A03   IDENTICAL   score 445.5->445.5   chains 5->5  anchors 8->8  constraints 8->8
A04   IDENTICAL   score 205.61->205.61 chains 4->4  anchors 8->8  constraints 8->8
A05   IDENTICAL   score 530.1->530.1   chains 2->2  anchors 6->6  constraints 6->6
```

## 1. Survival matrix

```
       Primitive   TxCandidate   SearchPath   Beam40k   Beam80k   Reconciled
C06       ALL          ALL          YES        PRUNED    PRUNED      NO
C05       —            —             —           —         —          —
C10       —            —             —           —         —          —
```

`C05` and `C10` were not reached: C06 answered the question decisively and the brief's
own rule is to stop at the first failure stage rather than sweep every fixture. Their
extraction is recorded as not-done, not as passed.

## 2. Stage 1 — do the correct primitives exist? (C06)

Read out of the frozen candidate layer, no search involved:

```
money candidates 492   role-eligible 122   date candidates 45   lines 229

opening balance anchor     200,000.00   FOUND  conf=1.00  col=c47  support=1.00  roleEligible
closing balance anchor      63,343.68   FOUND  conf=1.00  col=c47  support=1.00  roleEligible

tx 1  04/12   32,355.31   FOUND  conf=1.00  col=c13  support=1.00  roleEligible
tx 2  04/12   38,583.87   FOUND  conf=1.00  col=c13  support=1.00  roleEligible
tx 3  04/09   91,000.00   FOUND  conf=1.00  col=c13  support=1.00  roleEligible
tx 4  04/09  107,308.04   FOUND  conf=1.00  col=c13  support=1.00  roleEligible
tx 5  04/13    2,522.72   FOUND  conf=1.00  col=c13  support=1.00  roleEligible
tx 6  04/14    2,230.12   FOUND  conf=1.00  col=c13  support=1.00  roleEligible
tx 7  04/15       34.62   FOUND  conf=1.00  col=c13  support=1.00  roleEligible
tx 8  04/15    4,500.00   FOUND  conf=1.00  col=c13  support=1.00  roleEligible
```

**Every primitive exists at maximum confidence, in fully-supported columns, and is
role-eligible.** The anchors sit in one column (`c47`) and all eight transactions in
another (`c13`). The ground truth reconciles exactly:
`200,000.00 + 70,939.18 − 207,595.50 = 63,343.68`.

→ **Not `PRIMITIVE_CANDIDATE_GENERATION_FAILURE`.** No beam width is needed to have the
right numbers available.

## 3. Stage 2 — can the search walk the correct path, and does it survive?

The trace watches the exact trajectory the search would have to walk: start at the GT
opening anchor, consume the eight GT transactions in document order, arrive at the GT
closing. At **beam 80,000** the observed states were:

```
step 135  beam 80,000        cutoff none
    rank  50,073  of 80,000   200000|0              (0 amounts consumed)
    rank  66,527  of 80,000   200000|-132121.7      (6 amounts)
    rank  66,113  of 80,000   200000|-136656.32     (8 amounts)  <- = closing - opening

step 136  frontier 240,001   cutoff 169.8
    rank 131,437  of 240,001  200000|0
    rank 170,366  of 240,001  200000|-127368.86     (4 amounts)
    rank 202,362  of 240,001  200000|-136656.32     (8 amounts)  -> PRUNED
```

At 40,000 the trajectory died after two transactions (`200000|70939.18`), ranked
~114,345 of a 120,001 frontier.

**Two facts, both decisive:**

1. **The path is expressible.** At 80,000 the trajectory reaches the final state exactly
   on the closing balance. Candidate generation *and* the state model can represent the
   correct answer. → **Not `SEARCH_STATE_MODEL_FAILURE`.**

2. **The path is ranked catastrophically low, and its rank worsens as it gets longer.**
   Rank by chain length at the pruning step: `131,437` (0 amounts) → `170,366` (4) →
   `202,362` (8), against a beam of 80,000 and a frontier of 240,001.

## 4. Earliest failure stage

```
C06  →  SEARCH_RANKING_FAILURE
```

Not `SEARCH_PRUNING_FAILURE`. The brief's discriminator is the rank: a path pruned at
rank 40,001 of 40,000 is a beam-width problem. A path sitting at rank 131,000–203,000 of
240,001 is nowhere near the cutoff — widening the beam does not fix it, it only changes
how many wrong states are kept alongside it.

## 5. Why the objective penalises correct chains — structural cause

The rank ordering in §3 is not noise; it is monotone in chain length. That points at the
objective's shape, which is visible directly in the frozen code:

- **every amount consumed costs** `W_AMOUNT_COST × confidence × isolation`
- **only a satisfied constraint pays**

So a correct 8-transaction chain pays eight amount costs and collects one constraint
bonus, while a spurious 2-transaction chain pays two costs and collects the same bonus.
**Shorter chains win systematically, and the correct chain is usually the longest one in
the document.** That is exactly the rank ordering measured above, and it is the same
mechanism behind the A04 false accept from the blind run, where the correct 2-amount
chain scored 0.017 against a wrong chain's 0.931.

This is recorded as a hypothesis with direct supporting measurement. It was **not**
acted on: no weight was changed this round.

## 6. Architecture verdict

# Case C — structural objective insufficient

Per the brief's §15:

> GT path 能表达，但排名长期极低 …… 结论为 objective / structural representation 不足，
> 不是 beam 太小。

Concretely, the answers to the three questions this round existed to settle:

| Question | Answer | Evidence |
|---|---|---|
| Do the correct primitives exist? | **Yes** | all 9 at conf 1.00, role-eligible |
| Is the correct search path expressible? | **Yes** | trajectory reaches the exact final state at beam 80k |
| Pruned, or ranked too low? | **Ranked too low** | rank 131k–203k of 240k, monotonically worse with length |

Therefore:

- **Do not permanently raise the beam.** It does not recover the path even at 80k, and
  the rank shows the cause is not width.
- **Do not implement subtotal structure yet.** The brief defers it, and this diagnosis
  says the immediate bottleneck is the objective, not a missing structural relation.
- **Do not touch candidate generation.** It is producing everything correctly at
  maximum confidence.

The next cut is at the **objective**, and the specific defect to attack is now stated in
measurable terms: *consuming an amount is a cost and only a closed constraint pays, so
the objective prefers short chains and the correct chain is the long one.*

## 7. Harness fix (not a parser change)

The v0 driver reported C10 as a timeout while the worker actually completed at 305.9s and
overwrote the timeout record. Cause: `SIGKILL` to the `npx` wrapper did not kill the
grandchild. Fixed by launching the worker with `process.execPath` directly, spawning it
`detached: true` so the timeout can kill the whole process group, and making the driver's
verdict immutable once the timer has fired. `Blind Evaluation v0` results are unaffected —
the fix changes the harness, not the measurement.

## 8. Reproduction

```bash
npm run diag:primitives -- corpus/court/C06-stretto-x130.pdf corpus/diagnostic/gt-C06.json
npm run diag:trace -- corpus/court/C06-stretto-x130.pdf corpus/diagnostic/gt-C06.json --beam 80000
npm run diag:trace -- <any.pdf> <gt.json> --verify     # proves trace changes nothing
```

`C05` and `C10` remain undiagnosed. Their ground truth (including all 22 and 62
transactions) has not been extracted, which is why they were not reached.
