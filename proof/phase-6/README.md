# Phase 6 acceptance record

Generated July 17, 2026 Eastern Time.

## Outcome

PARTIAL / BLOCKED — the keeper SDK, valueless Anchor escrow, deployable SBF artifact, generated IDL, security controls, and actual local TxLINE CPI flow pass. The mandatory mainnet transaction chain is not complete because the deployment wallet is underfunded. Phase 6 is not represented as passing, and Phase 7 has not started.

## Keeper workflow

- `txline.keeper.prepare` waits for lifecycle finality, validates the fixture and sequence, fetches the market-owned stat order, performs a read-only TxLINE verification, and prepares the exact validation instruction.
- `watchAndSettle` supports proof-only dry runs, explicit consumer-owned submission, one to ten bounded attempts, confirmation checks, cancellation, retry callbacks, and successful-settlement callbacks.
- Missing submitters, invalid attempt counts, false predicates, fixture mismatches, bad final records, empty signatures, transaction errors, retry exhaustion, and cancellation are typed failures.
- A post-confirmation observer failure is never treated as a reason to resubmit.

## Demo escrow

- Program ID: `AzfXDFdCyMY99KbcnhcqFud56SG2Xn9c88tGSzjtXQRS`.
- Three valueless home/draw/away pools accept classic Token or Token-2022 mints.
- The program constructs the immutable home-score minus away-score predicate; callers cannot inject a settlement strategy.
- Proofs must match the market fixture and contain exactly ordered stat keys 1 and 2 at full-match period 100.
- Entry, settlement, and refund windows are immutable and disjoint. Settlement closes when refunds open, removing the settlement/refund race found during UAT.
- Permissionless settlement calls TxLINE through `txline-kit-cpi`; only an exact one-byte true return from the configured oracle program settles the market.
- Claims are proportional, the last winner receives integer dust, payout totals cannot exceed escrow, and exact token deltas reject unsupported transfer behavior.
- An unsettled market becomes permissionlessly refundable after its deadline.

## Automated validation

- TypeScript: 53/53 PASS; 93.77% statements, 87.88% branches, 97.77% functions.
- Rust: 13/13 PASS across demo, CPI unit, and consumer API tests.
- TypeScript typecheck, ESM/CJS/declaration build, Cargo format, Clippy with warnings denied, mainnet/default build, devnet feature build, Rust 1.85 minimum, rustdoc, and crate package verification: PASS.
- Anchor IDL regeneration: semantic match with the committed IDL.
- Solana SBF build: PASS; 366,288-byte artifact.

## Actual CPI evidence

A local validator loaded the compiled demo program beside cloned mainnet TxLINE program `9Exb...cKaA` and daily-root account `6d9b...HWgtE`. Protected fixture 18,241,006 at sequence 962 proved a 1–2 final score. Local transaction `3TKK...9SN8` invoked demo `Settle`, then TxLINE `ValidateStatV2`, consumed 216,943 compute units total, received return data `01` from TxLINE, and completed successfully at 8:53:42 PM EDT on July 17, 2026.

The away winner received 2,000 units from two 1,000-unit stakes; the losing balance and escrow vault ended at zero. A separate 500-unit position refunded after the deadline, also leaving its vault at zero.

## Mainnet gate

The 366,288-byte program requires a current rent-exempt minimum of 2.55025536 SOL. The dedicated burner holds 0.065004961 SOL, leaving a rent-only shortfall of 2.485250399 SOL before transaction fees and any temporary deployment-buffer requirement. No mainnet deployment was attempted. The required valueless mint, market, entries, proof-backed settlement, claim/refund chain, explorer links, and final authority disposition remain blocked on funding.

## Boundary

This is a hackathon demonstration, not an audit or real-money wagering system. The TxLINE stat proof anchors the selected score values; lifecycle finality remains a separate keeper trust assertion. Restricted recording content, credentials, wallet keys, and host paths are excluded from Git and this report.
