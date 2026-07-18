# Phase 1 — client authentication and normalized data

## What changed

- Adds explicit network configuration, wallet/store abstractions, typed errors, and a client factory.
- Implements guest auth, exact activation signing, existing-subscription reactivation, free subscription submission, credential headers, timeouts, and one-shot JWT renewal.
- Adds normalized score/odds snapshots, updates, history, schedules, semantic events, strict finalisation, `awaitFinal`, and async SSE streams.
- Produces split ESM and CommonJS bundles, declarations, source maps, subpath exports, and a package quick start.
- Adds comprehensive protocol, error-path, endpoint, stream, coverage, clean-room consumer, responsive, and accessibility QA.

## Why

Every proof, replay, strategy, demo, and UI phase needs one network-safe client boundary. This phase makes authentication and feed semantics explicit before cryptographic or settlement logic depends on them.

## Validation

- Strict typecheck and package build: PASS.
- Vitest: 25/25 PASS.
- Coverage: 91.78% statements/lines, 85.64% branches, 97.5% functions — PASS.
- Fresh packed-package ESM, CommonJS, subpath, and binary checks: PASS.
- Playwright/Axe: 4/4 responsive projects PASS, no serious/critical violations or horizontal overflow.

## Proof

- [Acceptance record](README.md)
- [Human-simulated UAT](UAT.md)
- [Private self-contained proof report](https://shared.claude.do/private/txline-kit-phase-1.html)
- Screenshot matrix in `screenshots/`

## Trust boundary

Strict feed finalisation is exposed as lifecycle evidence but is not represented as part of a statistical Merkle proof. The later demo requires an explicit signed finalisation attestation in addition to CPI-proven score values.
