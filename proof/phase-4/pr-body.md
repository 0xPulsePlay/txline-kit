# Phase 4 — deterministic replay server and fixture library

## What changed

- Adds a validated recording loader, shared virtual clock, play/pause/seek/speed/pause-on controls, deterministic mode, and status API.
- Serves replay auth, fixtures, scores, odds, resumable SSE, and exact recorded proof paths behind the real API layout.
- Extends `txline-replay serve` with explicit port, host, speed, seek, pause, breakpoint, and deterministic options.
- Adds three reproducible cleared synthetic matches and loader/session tests.
- Proves a protected real recording can travel SDK → replay → deployed mainnet validation without exposing its body.

## Why

Review happens after live matches. A deterministic, API-compatible server lets judges and integrators reproduce the complete data/proof experience without changing application code or depending on provider availability.

## Validation

- Strict typecheck and ESM/CommonJS build: PASS.
- Vitest: 46/46 PASS.
- Coverage: 93.54% statements/lines, 87.35% branches, 98.41% functions — PASS.
- Synthetic fixture validation: 3/3 PASS.
- Deterministic SDK snapshot/proof/SSE, resume, missing proof, interactive clock/breakpoint UAT: PASS.
- Protected 19 MiB replayed proof through mainnet view: PASS.
- Playwright/Axe: 4/4 responsive projects PASS, no serious/critical violations or horizontal overflow.

## Proof

- [Acceptance record](README.md)
- [Human-simulated UAT](UAT.md)
- [Private self-contained proof report](https://shared.claude.do/private/txline-kit-phase-4.html)
- Screenshot matrix in `screenshots/`

## Data boundary

Only synthetic recordings are committed. The real provider recording remains private and was consumed directly from protected storage during UAT.
