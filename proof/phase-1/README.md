# Phase 1 acceptance record

Generated July 17, 2026 Eastern Time.

## Outcome

PASS — the TypeScript client foundation provides pinned network selection, wallet activation, credential lifecycle management, normalized score and odds access, resilient SSE consumption, strict finalisation semantics, and consumable ESM/CommonJS package outputs.

## Client contract

- `createTxLineClient` requires an explicit `mainnet` or `devnet` selection.
- Official API hosts, program IDs, token mints, RPC defaults, and Explorer clusters are pinned per network.
- A `baseUrl` override supports an isolated replay server without silently changing the chosen chain.
- Credentials use an injectable async store; the safe default is process-memory storage.
- Errors expose a stable `code`, human-readable message, status when present, and an actionable `fix`.

## Authentication and network safety

- Guest JWT acquisition is single-flight under concurrent callers.
- Activation signs the exact provider preimage `txSig:leagueIds:jwt`, including the double-colon empty-league case.
- Keypairs and wallet adapters are supported; absent message signing produces a typed error.
- An HTTP 401 triggers one JWT renewal and exactly one retry with both JWT and API-token headers.
- Activation failures preserve the network-mismatch diagnosis; stored credentials cannot cross wallets.
- Existing transaction signatures reactivate without submitting a second on-chain subscription.
- Anchor and Token-2022 subscription code is split into a lazy chunk and is not loaded for read-only client use.

## Data and stream contract

- Score and odds records normalize documented upper/lower-case fields while preserving unknown extensions.
- Snapshot, five-minute updates, historical records, fixture schedules, score streams, and odds streams share one typed boundary.
- Historical score responses support JSON arrays and provider SSE framing.
- SSE decoding covers arbitrary chunks, CRLF, comments, multiline data, IDs, event names, and retry hints.
- Reconnects send `Last-Event-ID`; retry delay is bounded; abort signals remain caller-controlled.
- Semantic helpers classify goals, cards, phase changes, finalisation, and other events.
- `awaitFinal` first checks history and then streams live updates.
- Finalisation is accepted only when action, status, and period all agree: `game_finalised`, `100`, `100`.

## Automated validation

- Strict TypeScript typecheck: PASS.
- Vitest: 25/25 PASS across recording, configuration, authentication, HTTP, normalization, buckets, endpoint routing, semantics, and SSE.
- Coverage gate: 91.78% statements/lines, 85.64% branches, 97.5% functions — PASS.
- ESM production build, CommonJS production build, declarations, source maps, and CLI: PASS.
- Fresh tarball install: ESM root/subpath import PASS; CommonJS root/subpath require PASS; binary discovery PASS.
- Playwright responsive/accessibility matrix: 4/4 PASS with no serious or critical Axe violations and no horizontal overflow.

## Trust and data boundaries

- Statistical proof and lifecycle finality remain separate claims.
- Full real-match recordings remain private; no provider payload or credential is embedded in this report.
- No real-money settlement or audited-contract claim is introduced in this phase.
