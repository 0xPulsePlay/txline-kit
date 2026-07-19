# Changelog

## Unreleased (0.2.0)

- Add namespace-generic `deriveRootPda` (`daily_scores_roots`, `daily_batch_roots`, `ten_daily_fixtures_roots` with ten-day bucketing) and `healTimestampMillis`. `dailyScoresPda` accepts an optional third `{ strict?: boolean }` argument; pass `strict: true` to reject seconds-unit timestamps with `PDA_TIMESTAMP_UNIT_SUSPECT` instead of silently deriving a wrong account (default `strict: false` matches v0.1.0's original behavior exactly).
- Add `waitForProofAvailability` with bounded exponential backoff on HTTP 404/409/425, plus opt-in `retry` on `ProofClient.fetch`/`forFinal`. `keeper.prepare`/`watchAndSettle` keep the v0.1.0 single-attempt, fail-fast default; pass `proofRetry: true` (or an explicit policy object) to opt in to the bounded wait (3 minutes by default) for a slow-anchoring daily root.

## 0.1.0 source release — 2026-07-18

- Add typed TxLINE client, authentication, normalized data, and resilient SSE streams.
- Add proof normalization, read-only RPC verification, safe predicate compilation, and bounded keeper workflows.
- Add deterministic `.trec` replay with three public synthetic fixtures and the `txline-replay` CLI.
- Add the `txline-kit-cpi` Rust crate and valueless proof-settled Anchor escrow demo.
- Add the six-screen public learning app and finalized mainnet settlement receipt.

The release is intentionally unaudited and excludes credentials, restricted recordings, real-money custody, and production betting functionality.
