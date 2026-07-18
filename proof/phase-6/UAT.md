# Phase 6 simulated human QA / UAT

## Required journeys exercised

1. Prepare and submit bounded consumer settlement through the keeper API.
2. Exercise dry-run, retry, confirmation failure, cancellation, and observer boundaries.
3. Build the Anchor escrow for SBF and regenerate its IDL.
4. Deploy the exact artifact through the upgradeable loader on a local mainnet clone.
5. Exercise deposits, real TxLINE CPI settlement, claims, missed-settlement refunds, and negative paths.
6. Close all application accounts, then close the local program and reconcile reclaimed rent.
7. Deploy the byte-identical artifact to mainnet while retaining upgrade/close authority.
8. Create a closable valueless Token-2022 mint and two opposing positions on mainnet.
9. Reject premature settlement, a proof-inconsistent outcome, a losing claim, and premature market teardown.
10. Settle through the live TxLINE program, pay the winner, close every temporary account, and verify finalized explorer evidence.

## Findings and fixes

| Severity | Finding | Fix | Result |
|---|---|---|---|
| Critical | Settlement remained possible after refunds opened. | Make settlement valid only before `refund_after`; refunds begin at or after it. | Resolved and integration tested. |
| High | Token extensions can change actual escrow deltas. | Reload token accounts and enforce exact before/after balances. | Resolved. |
| High | Caller-selected predicates could prove an unrelated fact. | Construct exact final-score predicates inside the program. | Resolved; wrong outcome rejected locally and on mainnet. |
| High | Rent teardown could strand live claims. | Track open positions; require terminal positions, full payout, and an empty vault before closure. | Resolved; premature close rejected and seven temporary accounts closed. |
| High | Initial mainnet UAT disposable signers existed only in memory. A pre-broadcast simulation failure made its setup balances unrecoverable. | Persist disposable signer checkpoints mode `0600` outside Git before writes and make setup resumable/idempotent. | Resolved before the successful chain. The first attempt left no escrow market but incurred approximately 0.0465 SOL of unrecoverable setup cost. |
| Medium | Anchor/Web3 multi-signer simulation returned `SignatureFailure` without program logs. | Construct, sign, simulate, and send transactions explicitly with fee payer plus required signer. | Resolved; initialization and all subsequent transactions finalized. |
| Low | Public RPC rate limiting produced retries after the PASS receipt. | Batch verification calls and exit explicitly after the final receipt. | Resolved in the runner; chain result independently re-queried. |

## Mainnet result

- Deployment and authority verification: PASS.
- Byte-for-byte deployed artifact verification: PASS.
- Two 1,000-unit valueless entries: PASS.
- Premature settlement rejection: PASS.
- Proof-inconsistent home outcome rejection against recorded 1–2 score: PASS.
- Live TxLINE CPI result: exact one-byte true.
- Winner payout: 2,000; vault balance: zero.
- Losing claim rejection: PASS.
- Market-close-before-position-close rejection: PASS.
- Position, market, vault, player-token, and mint cleanup: PASS.
- Six key transaction statuses independently re-queried as finalized with `err: null`.
- Wallet balance after successful flow and recoverable failed-attempt cleanup: `0.228898601 SOL`.

No unresolved blocking defect remains. Phase 6 is ready to merge before Phase 7 begins.
