# Phase 3 acceptance record

Generated July 17, 2026 Eastern Time.

## Outcome

PASS — stat positions, predicate coverage, integer thresholds, soccer key construction, market semantics, parlay constraints, lifecycle evidence, and deployed-program behavior are enforced by one safe compiler.

## Strategy compiler

- `strategy().stat(name, key)` owns requested order and assigns V2 indexes internally.
- Aliases and keys must be unique; unknown aliases and binary self-reference fail immediately.
- Only signed 32-bit integer thresholds and the deployed `add`/`subtract`, `greaterThan`/`lessThan`/`equalTo` shapes compile.
- Compilation fails with the names of every uncovered or multiply-covered stat.
- Outputs are immutable and align `statKeys`, alias positions, and Anchor strategy indexes.
- The confirmed soccer registry contains eight base stats across all eight documented period prefixes: 64 unique keys.

## Market layer

- Final result compiles home win, draw, and away win from total-goal keys `1,2` using subtraction against zero.
- Total-goals 2.5 compiles over as `home + away > 2` and under as `home + away < 3`.
- Only non-negative half-lines compile, preventing integer-score pushes from being represented incorrectly.
- Same-call parlays require one fixture and disjoint stat keys because one V2 bundle cannot prove multiple fixtures or cover one position twice.
- Market settlement checks the lifecycle record belongs to the same fixture.

## Empirical lifecycle correction

Official documentation says a final record sets action, status, and period. Human UAT against mainnet fixture `18241006` found:

- seq `962`: `action=game_finalised`, `statusId=100`, period omitted;
- seq `963`: a subsequent `disconnected` event;
- the final score proof at seq `963` still proves goals `1–2`.

The SDK now distinguishes `explicit-period-100` from `provider-period-omitted`. Settlement evidence requires `game_finalised` plus status 100, rejects any present non-100 period, and never invents the absent value. The signed keeper attestation remains responsible for binding that lifecycle evidence to the proven score.

## Mainnet market proof

- Fetched a fresh V2 proof for fixture `18241006`, seq `963`, stat keys exactly `1,2`.
- Compiler selected `Away win` from score `1–2`.
- Compiled strategy used indexes `0,1`, subtraction, and `< 0`.
- Deployed mainnet `validateStatV2` read-only view returned `true`.
- The market accepted seq `962` as `provider-period-omitted` lifecycle evidence and rejected synthetic wrong-period records.
- No transaction was sent and no funds were spent.

## Automated validation

- Strict TypeScript typecheck: PASS.
- Vitest: 42/42 PASS.
- Coverage: 93.54% statements/lines, 87.28% branches, 98.41% functions — PASS.
- Strategy module: 99.45% statements/lines, 95.41% branches, 100% functions.
- ESM/CommonJS builds, declarations, source maps, and strategy subpath export: PASS.
- Fresh mainnet market proof and lifecycle-evidence UAT: PASS.

## Trust boundary

The statistical proof returned `true`; the finalisation record is separate evidence and is not part of that Merkle predicate. The demo must present and attest both facts rather than implying the oracle proof covers lifecycle finality.
