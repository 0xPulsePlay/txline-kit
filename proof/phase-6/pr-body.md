## Phase 6 — Keeper and valueless CPI escrow

Adds the bounded keeper SDK, three-outcome Token/Token-2022 Anchor escrow, immutable non-overlapping settlement/refund windows, program-owned result predicates, exact-transfer and payout invariants, SBF/IDL tooling, and a real local integration flow through a clone of the live TxLINE program.

Local implementation and CPI UAT pass. The phase remains explicitly blocked on the mandatory mainnet transaction chain because the deployment wallet is 2.485250399 SOL short of the current rent-only requirement.

Interim proof: https://shared.claude.do/private/txline-kit-phase-6.html

Stacked on #6. Keep draft until mainnet deployment, explorer evidence, and final gate proof are added.
