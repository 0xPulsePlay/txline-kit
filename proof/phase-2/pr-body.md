# Phase 2 — normalized proofs and on-chain validation

## What changed

- Adds strict V2 proof fetching and normalization with immutable 32-byte hashes, BN timestamps/fixture IDs, ordered stat contracts, and typed failure guidance.
- Adds `forFinal`, u16-LE daily-root PDA derivation, local directional SHA-256 path verification, mainnet/devnet read-only validation, and composable validation instructions.
- Adds pinned-IDL/network enforcement, 1.4M-CU pre-instructions, and mappings for validation footguns.
- Adds proof/onchain subpath exports, documentation, unit/property boundary tests, protected mainnet UAT, and phase evidence.

## Why

Strategy and settlement code must consume one proof shape whose timestamp, network, hash widths, and stat positions cannot drift. This phase proves that boundary against the actual deployed mainnet program before higher-level predicates depend on it.

## Validation

- Strict typecheck and package build: PASS.
- Vitest: 34/34 PASS.
- Coverage: 92.38% statements/lines, 85.16% branches, 97.87% functions — PASS.
- Mainnet captured-bundle views: 3/3 PASS.
- Built instruction program, discriminator, account, payload, and compute budget inspection: PASS.
- Playwright/Axe: 4/4 responsive projects PASS, no serious/critical violations or horizontal overflow.

## Proof

- [Acceptance record](README.md)
- [Human-simulated UAT](UAT.md)
- [Private self-contained proof report](https://shared.claude.do/private/txline-kit-phase-2.html)
- Screenshot matrix in `screenshots/`

## Safety boundary

The SDK does not claim full local bundle verification until the undocumented score-stat leaf serialization reproduces multiple known roots. It exposes the safe local SHA-256 path primitive and the empirically verified on-chain view path now.
