# Changelog

## Unreleased (0.2.0)

- Add `buildMerkleTree`/`hashLeaf` (`@0xpulseplay/txline-kit/merkle`) — builds directional SHA-256 trees with per-leaf proof extraction and odd-leaf duplication, generating known-good and known-bad vectors for `.trec` fixtures and the deferred `verifyLocal` leaf-serialization work.
- Add `impliedProbabilities()` — converts a canonical odds record's percentages or decimal prices (including TxLINE's consensus milli-odds scaling) into a normalized home/draw/away probability triple with the bookmaker overround reported; raises `ODDS_PROBABILITIES_UNAVAILABLE` instead of guessing.
- Add namespace-generic `deriveRootPda` (`daily_scores_roots`, `daily_batch_roots`, `ten_daily_fixtures_roots` with ten-day bucketing) and `healTimestampMillis`. `dailyScoresPda` now rejects seconds-unit timestamps with `PDA_TIMESTAMP_UNIT_SUSPECT` instead of silently deriving a wrong account.
- Add `waitForProofAvailability` with bounded exponential backoff on HTTP 404/409/425, plus opt-in `retry` on `ProofClient.fetch`/`forFinal`. **Behavior change:** `keeper.prepare` now waits (bounded, 3 minutes by default) for the daily root to anchor instead of failing on the first 404; pass `proofRetry: false` for the previous single-attempt behavior.

## 0.1.0 source release — 2026-07-18

- Add typed TxLINE client, authentication, normalized data, and resilient SSE streams.
- Add proof normalization, read-only RPC verification, safe predicate compilation, and bounded keeper workflows.
- Add deterministic `.trec` replay with three public synthetic fixtures and the `txline-replay` CLI.
- Add the `txline-kit-cpi` Rust crate and valueless proof-settled Anchor escrow demo.
- Add the six-screen public learning app and finalized mainnet settlement receipt.

The release is intentionally unaudited and excludes credentials, restricted recordings, real-money custody, and production betting functionality.
