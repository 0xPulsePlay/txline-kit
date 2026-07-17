# Phase 4 acceptance record

Generated July 17, 2026 Eastern Time.

## Outcome

PASS — `.trec` recordings now replay through an API-compatible virtual-clock server with deterministic CI, interactive controls, resumable score/odds SSE, exact proof lookup, SDK transparency, and a cleared three-match synthetic library.

## Replay contract

- Every recording is fully validated for structure, monotonic time, checksums, and secret refusal before loading.
- The virtual clock supports speed from `>0` through `10000`, absolute or relative seek, pause/play, and pause-on-action.
- Deterministic mode emits without wall-clock waits and has a stable completed cursor.
- Status reports recording ID, network, fixtures, bounds, cursor, progress, speed, pause state, deterministic state, and pause-on action.
- Control bodies are JSON-only and capped at 64 KiB.
- CORS is explicit for local browser consumers.

## API compatibility

- Guest start and activation endpoints return permissive replay-only tokens.
- Fixture schedule, score snapshot/updates/history/stream, odds snapshot/updates/stream, and V2 stat proof paths are present.
- Proof requests match fixture, seq, and exact legacy/V2 key query shape; missing proofs return a clear 404 instead of fabricated data.
- SSE carries stable recording IDs, honors `Last-Event-ID`, and resumes at the first later record.
- New streams include the nearest record at or before the cursor so a tiny startup delay cannot drop initial state.
- `createTxLineClient({ network, baseUrl })` consumed snapshots, proofs, and streams with no replay-specific application code.

## Fixture library

Three synthetic and redistribution-safe recordings are committed:

- fixture 42: home win, 1–0;
- fixture 43: draw, 2–2;
- fixture 44: away win, 0–2.

Each contains kickoff, snapshot, goal, interim proof, odds update, provider-style omitted-period finalisation, and final proof. A deterministic generator reproduces every checksum.

## Protected real-recording UAT

- Loaded and independently revalidated the private 19 MiB fixture `18241006` recording with 241 records.
- Served it deterministically on the canonical test port without copying it into Git or proof HTML.
- The normal SDK fetched replay snapshot and seq `962` proof with stat keys `1,2,3001` and values `1,2,1`.
- The replayed historical proof returned `true` from deployed mainnet `validateStatV2`.
- A five-stat proof exposed Anchor/Solana transaction-buffer pressure; the error is now typed as `VALIDATION_PAYLOAD_TOO_LARGE` with guidance to split calls.

## Human control UAT

- Paused at cursor 1000, started score SSE, and played at 10×.
- Stream emitted kickoff ID 1, goal ID 3, and finalisation ID 6.
- Pause-on-goal stopped at cursor 1220 and progress 0.3667; clearing pause-on and resuming completed the stream.
- `Last-Event-ID: 3` returned only finalisation ID 6.
- Missing proof seq 99 returned HTTP 404 with fixture and seq.

## Automated validation

- Strict TypeScript typecheck and ESM/CommonJS build: PASS.
- Vitest: 46/46 PASS.
- Coverage gate: 93.54% statements/lines, 87.35% branches, 98.41% functions — PASS.
- Recording loader/session tests: 4/4 PASS.
- Three generated fixture validations: 3/3 PASS.
- SDK-over-replay and replay-to-mainnet proof UAT: PASS.

## Data boundary

Synthetic fixtures are explicitly cleared. Full provider recordings stay in protected local storage until written redistribution permission exists. The proof report contains only counts, selected non-sensitive values, hashes/IDs already needed for verification, and synthetic screenshots.
