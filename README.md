# TxLINE Kit

Safe TypeScript, replay, and Solana CPI tooling for TxLINE.

Version 0.1.0 is the proof-gated initial release. Explore the public learning app at [txline-kit.claude.do](https://txline-kit.claude.do).

Phase 1 adds the production client foundation: pinned network configuration, wallet activation, credential renewal, typed failures, score and odds normalization, five-minute bucket helpers, resilient SSE streams, and ESM/CommonJS package outputs.

See [`packages/txline-kit/README.md`](packages/txline-kit/README.md) for the package quick start.

Phase 2 adds strict V2 proof normalization, ordered stat contracts, daily-root PDA derivation, local directional SHA-256 verification primitives, read-only mainnet validation, and composable validation instructions.

Phase 3 adds a total-coverage strategy compiler, the confirmed 64-key soccer registry, final-result and total-goals markets, safe same-fixture parlays, and evidence-aware finalisation gates.

Phase 4 adds the virtual-clock replay server, deterministic CI mode, interactive playback controls, resumable SSE, exact proof serving, and three cleared synthetic match recordings.

Phase 5 adds the `txline-kit-cpi` Rust crate: a pinned `validate_stat_v2` ABI, feature-locked mainnet/devnet program IDs, timestamp-safe daily-root PDA derivation, byte-identical Anchor instruction serialization, and return-data origin/boolean checks. See [`crates/txline-kit-cpi/README.md`](crates/txline-kit-cpi/README.md) for the three-line consumer call.

Phase 6 adds a bounded keeper workflow and a valueless three-outcome Anchor escrow. The demo uses immutable, non-overlapping settlement/refund windows and performs actual CPI settlement against TxLINE. See [`programs/txline-demo-escrow/README.md`](programs/txline-demo-escrow/README.md) for its security boundary.

Phase 7 adds six public learning surfaces for replay, predicate slicing, Merkle proof anatomy, the finalized mainnet settlement, and SDK boundaries. All bundled matches are synthetic; the settlement receipt is public chain data.

Phase 8 prepares `@0xpulseplay/txline-kit` and `txline-kit-cpi` for registry release, makes the two 0xPulsePlay repositories public, and records the final release evidence. npm and crates.io publication is deliberately deferred — see [`docs/registry-publication-checklist.md`](docs/registry-publication-checklist.md); install from source per the package READMEs.

This is hackathon integration software, not an audit or real-money wagering product. See [`goal.md`](goal.md) for the explicit safety boundary and acceptance contract.
