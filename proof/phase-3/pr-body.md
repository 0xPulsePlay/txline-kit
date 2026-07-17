# Phase 3 — total-coverage strategy compiler and markets

## What changed

- Adds a fluent strategy compiler that owns V2 stat order/indexes and requires exact one-time coverage.
- Adds immutable integer predicates, add/subtract expressions, typed compiler errors, and the confirmed 64-key soccer registry.
- Adds final-result, total-goals half-line, lifecycle-gated settlement, and safe same-fixture/disjoint-stat parlay helpers.
- Corrects finalisation handling after real mainnet UAT proved documented final records may omit period while retaining `game_finalised/statusId=100`.
- Adds strategy subpath exports, documentation, adversarial compiler tests, fresh mainnet market simulation, and phase evidence.

## Why

The V2 interface is positional and rejects incomplete coverage. These are exactly the errors that should be impossible before a transaction reaches Solana. Market helpers also need honest boundaries for half-lines, fixture scope, and lifecycle evidence.

## Validation

- Strict typecheck and package build: PASS.
- Vitest: 42/42 PASS.
- Coverage: 93.54% statements/lines, 87.28% branches, 98.41% functions — PASS.
- Strategy module: 99.45% statements/lines, 95.41% branches, 100% functions.
- Fresh exact-key mainnet away-win view and real lifecycle record gate: PASS.
- Playwright/Axe: 4/4 responsive projects PASS, no serious/critical violations or horizontal overflow.

## Proof

- [Acceptance record](README.md)
- [Human-simulated UAT](UAT.md)
- [Private self-contained proof report](https://shared.claude.do/private/txline-kit-phase-3.html)
- Screenshot matrix in `screenshots/`

## Trust boundary

The Merkle proof validates selected stats. The SDK separately requires lifecycle evidence and records whether period 100 was explicit or omitted by the provider; the later keeper attestation binds that evidence for settlement.
