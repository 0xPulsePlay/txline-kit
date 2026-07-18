# Phase 0 — preservation and bootstrap

## What changed

- Establishes the pnpm workspace, package skeleton, dual-license intent, CI, canonical worktree ports, delivery goal, and phase proof system.
- Defines `.trec` v1 and a streaming capture importer with chronological channel merge, integrity manifests, validation, and secret refusal.
- Records the real-archive reconciliation and the protocol evidence needed by proof, strategy, and settlement phases.
- Corrects the settlement model after confirming that statistical CPI does not prove the feed lifecycle's finalisation record.

## Why

Live and historical recordings must be preserved before higher-level SDK work, and later modules need evidence-backed stat, timing, hash, and odds contracts rather than assumptions.

## Validation

- Strict typecheck and package build: PASS.
- Vitest: 6/6 PASS; 100% lines/statements/functions and 94.36% branches for recording logic.
- Real fixture import: 241/241 source records, stable SHA-256, independent validation PASS.
- Playwright/Axe: 4/4 responsive projects PASS, no serious/critical violations or horizontal overflow.
- Existing capture services remained active and untouched.

## Proof

- [Acceptance record](README.md)
- [Human-simulated UAT](UAT.md)
- [Private self-contained proof report](https://shared.claude.do/private/txline-kit-phase-0.html)
- Screenshot matrix in `screenshots/`

## Data boundary

No real `.trec` file is committed. Full provider recordings remain private until written redistribution permission exists.
