# TxLINE Kit

Safe TypeScript, replay, and Solana CPI tooling for TxLINE.

Development is proceeding as a proof-gated stacked PR series. The repository remains private until the release gate is complete.

Phase 1 adds the production client foundation: pinned network configuration, wallet activation, credential renewal, typed failures, score and odds normalization, five-minute bucket helpers, resilient SSE streams, and ESM/CommonJS package outputs.

See [`packages/txline-kit/README.md`](packages/txline-kit/README.md) for the package quick start.

Phase 2 adds strict V2 proof normalization, ordered stat contracts, daily-root PDA derivation, local directional SHA-256 verification primitives, read-only mainnet validation, and composable validation instructions.

Phase 3 adds a total-coverage strategy compiler, the confirmed 64-key soccer registry, final-result and total-goals markets, safe same-fixture parlays, and evidence-aware finalisation gates.

Phase 4 adds the virtual-clock replay server, deterministic CI mode, interactive playback controls, resumable SSE, exact proof serving, and three cleared synthetic match recordings.
