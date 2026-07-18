## Phase 6 — Keeper and valueless CPI escrow

Adds the bounded keeper SDK, three-outcome Token/Token-2022 Anchor escrow, immutable non-overlapping settlement/refund windows, program-owned result predicates, exact-transfer and payout invariants, SBF/IDL tooling, and a real local integration flow through a clone of the live TxLINE program.

Local implementation, reversible deployment rehearsal, mainnet deployment, live TxLINE CPI settlement, winner claim, and complete temporary-account teardown pass. The deployed artifact was dumped from mainnet and matches the rehearsed binary byte for byte. Upgrade and close authority remains retained.

Proof: https://shared.claude.do/private/txline-kit-phase-6.html

Stacked on #6. Phase gate evidence is complete and no blocking defect remains.
