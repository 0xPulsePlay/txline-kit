# Phase 3 simulated human QA / UAT

## Required developer journey

1. Build home/draw/away and 2.5 over/under markets without manually assigning positions.
2. Inspect the emitted `statKeys`, indexes, operations, comparisons, and integer thresholds.
3. Attempt empty, uncovered, duplicate-covered, invalid-threshold, unknown-key, and unsupported-operation strategies.
4. Attempt an empty parlay, cross-fixture parlay, overlapping-stat parlay, and valid disjoint same-fixture parlay.
5. Fetch an exact `[1,2]` proof and run the compiled final-result strategy through mainnet view simulation.
6. Fetch real historical lifecycle records and apply the market settlement gate.
7. Compare documented period behavior with the actual final record.
8. Confirm proof validity and lifecycle finality remain separate evidence.
9. Review the evidence page on desktop, laptop, tablet, and mobile.

## Findings and fixes

| Severity | Finding | Fix | Result |
|---|---|---|---|
| Critical | Real mainnet `game_finalised/statusId=100` omitted the documented period field, so the earlier three-field predicate rejected a valid final. | Added explicit evidence quality: accept omitted period only for the observed action/status pair, accept explicit 100, reject all other periods. | Resolved and live-tested. |
| High | Manually authored V2 indexes can point at the wrong requested key. | Compiler owns insertion order and positions; callers reference aliases only. | Resolved. |
| High | The program rejects incomplete or duplicate stat coverage. | Compile fails locally with every uncovered and multiply-covered alias named. | Resolved. |
| High | A generic parlay API could imply atomic validation across fixtures or reuse one stat twice. | Reject cross-fixture and overlapping-stat legs; safely remap disjoint same-fixture positions. | Resolved. |
| Medium | Passing decimal 2.5 directly to the i32 strategy field is invalid. | Compile over 2.5 as integer `>2` and under 2.5 as integer `<3`; require half-lines. | Resolved. |
| Medium | Synthetic strategies alone would not prove compatibility with the deployed IDL. | Fetched exact `[1,2]` final-score proof and received `true` from mainnet for compiled away-win strategy. | Resolved. |
| Medium | A score proof could be mistaken for proof of lifecycle finality. | Market API requires a separate same-fixture lifecycle record and reports its evidence quality. | Resolved. |

No Critical, unresolved High, or required-flow Medium defect remains.
