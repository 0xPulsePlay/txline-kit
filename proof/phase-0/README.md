# Phase 0 acceptance record

Generated July 17, 2026 Eastern Time.

## Outcome

PASS — repository publication, capture preservation, the versioned recording contract, real-archive import, protocol evidence, CI, canonical ports, and proof-report infrastructure are operational.

## Repository publication

- `0xPulsePlay/txline-capture` exists privately with `main` and all five phase branches pushed.
- Capture draft PRs 1 through 5 are correctly stacked from data foundation through productionization.
- `0xPulsePlay/txline-kit` exists privately with seeded `main` and Phase 0 on `agent/00-preserve-and-bootstrap`.
- Existing capture worktree remained clean and all ten user-level capture units remained active.

## Real archive preservation

Fixture `18241006` was imported into `.trec` v1 without committing the restricted recording.

- Source lines: 68 score/SSE + 2 snapshot + 133 odds + 38 proof = 241.
- Imported records: 241, globally timestamp ordered.
- Recording size: 19 MiB.
- Recording SHA-256: `cb4e322e4fd04a6b05d5035bb8343133ec04474da2d82ea2873f3fcef76678e3`.
- A second validation pass reproduced the count, channel matrix, time bounds, and digest exactly.
- Unit tests additionally prove tamper detection, structural failures, channel classification, and refusal of secret-shaped source/body text.

## Empirical protocol findings

1. The pinned official source states scores roots are posted in UTC-aligned five-minute intervals. Mainnet epoch day `20646` had 38 successful writes; observed gap p50 was 300 seconds and p95 was 900 seconds.
2. Live odds proof polling measured time from initial 404 to first 200. Across fixtures `18257739` and `18257865`, 65 samples had an approximately 31.4-second median; observed maximum was 63.849 seconds.
3. Historical score proofs remain available after match completion: fixture `18241006` yielded 38 successful responses 36–126 hours after their source timestamps. Separate captured view simulations verified mainnet fixtures `18222446` and `18202783`.
4. The deployed mainnet program binary imports `sol_sha256`; SHA-256 is the Merkle hash primitive. Exact leaf canonicalization remains deliberately blocked from public `verifyLocal` until Phase 2 reproduces several roots.
5. Official soccer keys are total goals `1/2`, cards `3–6`, and corners `7/8`, with period prefixes. `3001/3002` are second-half goals—not finalisation. Feed finality and statistical proof are therefore separate trust claims.
6. Captured StablePrice odds are arrays with `FixtureId`, `MessageId`, `Ts`, bookmaker metadata, `SuperOddsType`, `MarketParameters`, `MarketPeriod`, ordered `PriceNames`, integer `Prices`, and decimal-string `Pct`.
7. Stats and strategy thresholds are integers. For total goals, over 2.5 compiles to `home + away > 2`; under 2.5 compiles to `home + away < 3`.

## Trust-boundary correction

The oracle CPI proves selected stat values but not the feed's `game_finalised/statusId=100/period=100` lifecycle record. The demo settlement will therefore require both a score proof and an explicit signed keeper finalisation attestation. Documentation and UI must show the distinction.

## Automated validation

- TypeScript strict typecheck: PASS.
- Vitest recording suite: 6/6 PASS; 100% lines/statements/functions and 94.36% branches.
- Package build: PASS.
- Playwright responsive/accessibility matrix: 4/4 PASS with no serious or critical Axe violations and no horizontal overflow.
- Real import and independent validation: PASS.
- Port allocation: PASS at registered prod/dev/test backend and frontend purposes without disturbing the existing explorer.
- Secret/data boundary: PASS; real recording remains outside Git and `.trec` outputs are ignored.
