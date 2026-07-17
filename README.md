# TxLINE Kit

Safe TypeScript, replay, and Solana CPI tooling for TxLINE.

Development is proceeding as a proof-gated stacked PR series. The repository remains private until the release gate is complete.

Phase 1 adds the production client foundation: pinned network configuration, wallet activation, credential renewal, typed failures, score and odds normalization, five-minute bucket helpers, resilient SSE streams, and ESM/CommonJS package outputs.

See [`packages/txline-kit/README.md`](packages/txline-kit/README.md) for the package quick start.

Phase 2 adds strict V2 proof normalization, ordered stat contracts, daily-root PDA derivation, local directional SHA-256 verification primitives, read-only mainnet validation, and composable validation instructions.
