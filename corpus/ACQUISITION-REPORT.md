# Corpus acquisition report — blind-corpus-v0 (draft)

**The parser was not run at any point in this stage.** Admission was decided by
reading raw `pdf.js` text dumps (`npm run corpus:dump`) and checking the arithmetic
on the page by hand. Running the parser first would have contaminated the blind set
before it existed.

---

## A. Acquisition funnel

| Stage | Count |
|---|---|
| Search results reviewed (Google + Bing, ~35 queries) | ~350 |
| Unique PDF URLs extracted, spam filtered | 104 |
| Downloaded and opened | 15 |
| Valid PDF with a text layer | 15 |
| Bank-generated statement layout | 6 |
| **Arithmetic verified self-consistent** | **5** |
| Unique layout families | 5 |
| **Blind eligible** | **5** |

Seven of the 15 downloads were rejected as `NOT_A_STATEMENT` or
`INSUFFICIENT_TRANSACTION_DETAIL`. Two were rejected on source type (a property
statement, a court financial disclosure with no transaction table).

## B. Blind candidate table

| ID | Bank | Country | Source type | Account | Pg | Text | Balance structure | Nature | Arithmetic | Layout family | Eligible |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A03 | Leominster Credit Union | US | bank official | savings | 1 | yes | running each row | official sample | **yes** | `lcu-multi-account-wd-dep-balance` | ✅ |
| A04 | The Bancorp Bank, N.A. | US | bank official | business | 4 | yes | sparse (daily) | official sample | **yes** | `bancorp-two-panel-daily-balance` | ✅ |
| A05 | RBC Royal Bank | CA | bank official | checking | 1 | yes | running each row | official sample | **yes** | `rbc-summary-then-detail` | ✅ |
| S02 | Wells Fargo Bank, N.A. | US | public record | business | 30 | yes | sparse (daily ledger) | **real** | **yes** | `wf-commercial-summary-daily-ledger` | ✅ |
| G01 | Commerce Bank | US | banking RFP | business | 143 | yes | sparse (daily) | official sample | **yes** | `commerce-business-summary-daily` | ✅ |
| S03 | Wells Fargo Bank, N.A. | US | public record | business | 30 | yes | sparse | real | unknown | same as S02 | ❌ `ARITHMETIC_NOT_YET_VERIFIED` + duplicate family |

### Arithmetic evidence

Every eligible entry was verified by hand from the printed figures:

```
A03  20649.65 + 402.72 - 217.00                       = 20835.37   ✓
     row check: 20649.65 - 217.00 = 20432.65                       ✓
A04  6.97 + 13.68 - 13.57                              = 7.08      ✓
A05  4247.14 + 145.15 - 727.50                         = 3664.79   ✓
S02  2433.11 + 7.75 - 0.00                             = 2440.86   ✓
G01  4823.87 + 40961.04 - 12642.80 - 31853.38          = 1288.73   ✓
```

## C. Rejected corpus

| Reason | Count | Entries |
|---|---|---|
| `NOT_A_STATEMENT` | 6 | A02, G02, G03, G04, G05, X01 |
| `INSUFFICIENT_TRANSACTION_DETAIL` | 2 | A01, S01 |
| `ARITHMETIC_NOT_YET_VERIFIED` | 1 | S03 |
| `DUPLICATE_LAYOUT` | 1 | S03 (also, see G01 note) |

No `FAKE_SAMPLE`, `IMAGE_ONLY` or `PRIVACY_RISK` rejections reached the download
stage: the source filter (bank-owned domains, `.gov`/`.us`, court filings,
procurement documents) and the spam-network blocklist removed them earlier. The
`ULfGpd` template ring alone appeared on four unrelated domains across two search
engines, and was excluded by URL pattern.

## D. Source yield

| Source | Opened | Bank-generated | Self-consistent | Blind eligible | Yield |
|---|---|---|---|---|---|
| **Banking RFP / procurement** | 3 | 1 | 1 | **1** | **33%** |
| **Government public record** | 4 | 2 | 1 | **1** | **25%** |
| **Bank-owned official sample** | 5 | 3 | 3 | **3** | **60%** |
| Other official / generic | 3 | 0 | 0 | 0 | 0% |

**Bank-owned "how to read your statement" documents had the highest raw yield** —
three of five were real layouts with consistent figures. This partly contradicts the
brief's expectation that RFPs would be highest-yield: RFPs are the most *reliable*
source (a genuine bank statement is a real deliverable in a deposit-services bid),
but they are also the most *diluted* — a 143-page RFP yielded one statement on page
58, and two of the three RFPs contained none at all.

The finding that matters for planning: **public records are the only source of
`transactionNature: real` documents.** Every bank-owned sample is an
`official_sample`, and those are illustrations whose numbers were composed for the
document. Only S02/S03 are statements the bank actually produced for an account.

## E. Recommendation

**Continue, but change the search strategy.** The predicted RFP volume did not
materialise: three RFPs, one statement. Government/bankruptcy records produced real
statements but at low density (one per filing, buried in 30–442 pages).

Two specific changes, both cheap:

1. **Search court filing systems directly rather than the open web.** Both public-record
   hits came from a bankruptcy claims agent (`cases.stretto.com`) where bank
   statements are filed as exhibits as a matter of routine. That is a *different
   search interface* from Google, and it is where real statements concentrate.
2. **Stop searching `filetype:pdf "sample bank statement"`.** Every hit from that
   pattern in this round was either spam, a teaching worksheet, or a bank's
   annotated illustration.

**On the 60-layout target: I do not think it is reachable this way.** Five eligible
layouts came from 15 documents at ~350 reviewed results. Extrapolating linearly,
60 independent layouts needs roughly 180 documents and several thousand results,
with the same ~30% admission rate. That is achievable but it is a research project,
not a task — and the density of *real* (as opposed to official-sample) statements in
the public web appears to be the binding constraint.

### A finding that changes an earlier conclusion

**G01 is the same layout family as the existing `us-commerce-bank.pdf`** — a
Commerce Bank business checking statement, same Kansas City address, same summary +
daily-balance structure. But G01 reconciles exactly and the existing file does not
(its checks total 305.00 against a summary counting 200.00).

**Verified, and my first explanation was wrong.** I re-downloaded the original from
`commercebank.com` and its SHA-256 is identical to the stored fixture
(`53cb0d6f…`), so nothing was truncated in transit. Rendering the page confirms it is
a complete single page that ends cleanly at `Total Checks Paid $305.00` — no missing
daily-balance section, no page 2.

So the document is authentic *and* internally inconsistent:

```
summary   Checks Paid   -200.00
detail    75.00 + 30.00 + 200.00 = 305.00, printed "Total Checks Paid $305.00"
gap       105.00
```

Both subtotals are self-consistent with themselves and disagree with each other, so
no ledger reproduces the printed ending balance. The 2003 specimen is simply a
flawed mock document.

G01 settles it: the 2011 Commerce Bank statement in the St. Louis RFP is the same
layout family and prints `Total Checks Paid $31,853.38` against a summary of
`-31,853.38`. The bank's layout is correct; the 2003 specimen is wrong.

Consequence: `us-commerce-bank.pdf` is marked `SOURCE_NOT_SELF_CONSISTENT` and
removed from every correctness assertion in `tests/real-corpus.spec.ts`. It stays in
the corpus as a robustness fixture — the parser must not crash on it and must not
claim to have verified it. G01 is the valid fixture for that layout family.

## F. Not implemented (roadmap only)

Privacy-preserving local fixture exporter — preserving token geometry, relative
positions, row/column structure and the balance equations while anonymising
descriptions, identifiers and dates, and remapping amounts so that every arithmetic
relation is preserved. This is the only path I can see to a genuine *layout
distribution* rather than a handful of public documents. Not implemented, per the
brief.

---

# Round 2 — court and bankruptcy document systems

Following the recommendation from round 1: both real statements found there came from a
bankruptcy claims agent, so this round went straight at those systems.

## A. Acquisition funnel

| Stage | Count |
|---|---|
| Queries run against court/bankruptcy systems | 14 |
| Unique PDFs extracted | 95 |
| Downloaded | 10 |
| Valid PDF with a text layer | 9 |
| Contained statement structure (keyword pre-filter) | 5 |
| **Arithmetic verified self-consistent** | **3** |
| **Blind eligible added** | **3** |

## B. Added to the blind pool

| ID | Bank | Source | Period | Balance structure | Arithmetic |
|---|---|---|---|---|---|
| C06 | **Bank of America, N.A.** | stretti | 04/2021 | opening/closing only | `200000.00 + 70939.18 − 0.00 − 207595.50 = 63343.68` ✓ |
| C10 | unnamed operating | stretti | 07/2026 | opening/closing only | `379464.44 + 457632.54 − 366629.64 = 470467.34` ✓ |
| C05 | unnamed (×3 accounts) | stretti | 08/2020 | opening/closing only | `502519.22 + 0.16 − 499308.99 − 0.00 − 3210.39 = 0.00` ✓ |

Two extras worth noting: C06's deposits detail (`32355.31 + 38583.87`) matches its own
stated `Amount of Deposits/Credits`, and C10 prints the **item count in parentheses**
next to each section total (`+ Deposits and Credits (3)`), which reconciles with its
three detail rows. Those cross-checks make both unusually safe ground truth.

**All three are `transactionNature: real`** — actual bank-generated statements for
actual accounts, filed as court exhibits. This is the first round to add real
documents rather than official samples.

## C. Rejected

| ID | Reason | Detail |
|---|---|---|
| C07 | `NOT_A_STATEMENT` | A QuickBooks reconciliation register. Arithmetic is internally consistent but the document is the wrong type. |
| C01 | `UNUSABLE_TEXT_LAYER_STRUCTURE` | JPMorgan Chase statement whose text layer carries the generator's template markers (`*start*daily ending balance2`). No standard balance terminology found. |
| C09 | `ARITHMETIC_NOT_YET_VERIFIED` | High-volume account; the section figures do not reach the ending balance found later in the file, because several statements are concatenated. Needs its sections matched first. |
| C02 | read failure | `InvalidPDFException` — downloaded file is not a valid PDF despite a 200 response. |

## D. Source yield

| Source system | Downloaded | Bank-generated | Self-consistent | Eligible | Yield |
|---|---|---|---|---|---|
| **`cases.stretto.com`** (bankruptcy claims agent) | 7 | 4 | 3 | **3** | **43%** |
| `cdn.pacermonitor.com` | 1 | 1 | 0 (wrong doc type) | 0 | 0% |
| `pacermonitor.com/view` (paywalled) | 1 | 0 | 0 | 0 | 0% |
| Epiq / Kroll / Donlin Recano / Omni | 0 | — | — | — | URLs found by search did not resolve to public PDFs |

`cases.stretto.com` is the only productive system found. Notable: **`site:` queries
against the other claims agents returned zero PDFs** — Epiq, Kroll, Donlin Recano and
Omni either do not expose documents to search engines or serve them behind a session.
That is a real limitation, not a search failure, and it means the reachable pool of
public bankruptcy exhibits is narrower than expected.

## E. Blind pool status

```
blind eligible: 8   (A03, A04, A05, S02, G01, C05, C06, C10)
unique layout families: 8
real (not official sample): 4   (S02, C05, C06, C10)
```

Halved the remaining distance to the round-1 estimate of needing roughly 180 documents
for 60 layouts: 25 documents reviewed → 8 eligible, so ~60 layouts needs roughly 190
documents at this rate. The court channel is viable but document-dense: this round read
95 PDFs' worth of search results to find 3 usable statements, and two of the three
came from documents over 30 pages.

## F. Recommendation

**Continue with `cases.stretto.com` specifically, and stop searching other claims
agents.** All three additions came from that one host. Its document URLs are
sequential and predictable
(`/public/<case>/<id>/PLEADINGS/<id>.pdf`), so it can be enumerated rather than
searched — which is a much better acquisition strategy than keyword queries, and one
that does not depend on a search engine's `site:` support.

Also worth recording: **the keyword pre-filter produced a false positive (C07) and a
near-miss (C09)**. "Beginning Balance" appears in QuickBooks reports and in
concatenated multi-statement files. The filter is only a triage step; manual reading of
each candidate remains mandatory.
