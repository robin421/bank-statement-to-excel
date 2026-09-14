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

So the earlier conclusion that "Commerce Bank is internally inconsistent" was wrong
about the *cause*: the bank's layout is fine, and the copy in `fixtures/real/` is a
mangled or truncated rendering of it. That file should be re-downloaded and
re-checked, and it should not have been treated as a document with no ground truth.

## F. Not implemented (roadmap only)

Privacy-preserving local fixture exporter — preserving token geometry, relative
positions, row/column structure and the balance equations while anonymising
descriptions, identifiers and dates, and remapping amounts so that every arithmetic
relation is preserved. This is the only path I can see to a genuine *layout
distribution* rather than a handful of public documents. Not implemented, per the
brief.
