# Phase 6 simulated human QA / UAT

## Required journeys exercised

1. Configure a consumer through the documented package entry point and prepare a final-result settlement.
2. Verify the keeper refuses a false outcome before calling consumer submission code.
3. Exercise dry-run, bounded retry, successful confirmation, failed confirmation, cancellation boundaries, and observer callbacks.
4. Build the Anchor escrow for Solana SBF and regenerate its IDL from source.
5. Start a canonical-port local validator with the live mainnet TxLINE program and root account cloned into genesis.
6. Create a Token-2022 mint, market, vault, two opposing positions, and a separate refund market.
7. Feed the demo a protected, recorded mainnet proof without placing the recording or its location in the repository.
8. Inspect the successful transaction trace for the nested TxLINE invocation, return-data origin, exact boolean byte, and compute use.
9. Attempt premature settlement, wrong-outcome settlement, post-refund-window settlement, losing claim, double claim, premature refund, and double refund.
10. Reconcile all final wallet and vault balances.
11. Rebuild the deployable artifact, query live mainnet rent, and verify burner funding before any deployment attempt.

## Findings and fixes

| Severity | Finding | Fix | Result |
|---|---|---|---|
| Critical | Settlement remained possible after refunds opened. A refund followed by settlement could underfund winner claims. | Make settlement valid only in `[settle_not_before, refund_after)` and refunds valid only at or after `refund_after`; add a negative integration case. | Resolved; settlement after the refund window is rejected. |
| High | Token extensions can make requested transfer amounts differ from actual escrow deltas. | Reload destination accounts and require exact before/after deltas for entry, claim, and refund. | Resolved; unsupported transfer behavior fails atomically. |
| High | A caller-selected strategy could claim an arbitrary outcome with a valid unrelated proof. | Construct the three exact score-difference strategies inside the program and require ordered full-match goal keys. | Resolved and wrong-outcome tested. |
| High | Successful RPC submission followed by a throwing observer could accidentally enter the retry path. | Keep observer execution outside submission/confirmation retry handling. | Resolved; the confirmed transaction is submitted once. |
| Medium | Integer proportional payouts can leave dust in the vault. | Pay floors to earlier winners and all remaining pool balance to the final winning stake. | Resolved in checked payout logic. |
| Medium | A reported signature can still represent a failed transaction. | Inspect confirmation `value.err` and retry only as a submission failure. | Resolved and tested. |
| External gate | Mainnet deployment needs materially more SOL than the funded burner holds. | Do not attempt deployment or label the phase complete; publish the exact rent and shortfall for funding. | BLOCKED: 2.485250399 SOL rent-only shortfall. |

## Local-chain result

- Actual nested TxLINE CPI: PASS.
- Proven final score: home 1, away 2.
- Settlement return origin: TxLINE mainnet program clone.
- Return payload: exactly one byte `01`.
- Compute: 216,943 total; 202,521 inside TxLINE.
- Winner payout: 2,000; settlement vault: 0.
- Refund: 500; refund vault: 0.
- Seven negative program paths: PASS.

No unresolved Critical, High, or required-flow Medium code defect remains. The required external mainnet deployment and transaction-chain gate remains unresolved, so Phase 6 is not complete and the phase stack must not advance.
