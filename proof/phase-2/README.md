# Phase 2 acceptance record

Generated July 17, 2026 Eastern Time.

## Outcome

PASS — V2 score proofs are normalized into one strict positional bundle, daily-root accounts are derived without timestamp ambiguity, local SHA-256 path primitives are deterministic, and captured private proofs validate through the deployed mainnet program.

## Proof contract

- `tx.proofs.fetch` accepts only positive fixture IDs, `seq >= 1`, and unique non-negative `statKeys`.
- V2 is the canonical shape; requested stat order is stored on every bundle and must exactly match `statsToProve` and `statProofs`.
- Hex, base64, arrays, and `Uint8Array` hash inputs normalize to immutable 32-byte arrays.
- Every malformed hash names its exact path and fails before Anchor serialization.
- Fixture IDs, timestamps, and update counts are range checked; proof fixture mismatches fail closed.
- Fixture and timestamp fields become BNs; payload `ts` is exactly `summary.updateStats.minTimestamp`.
- `forFinal` composes strict lifecycle finalisation with proof fetch and defaults to confirmed score keys `1,2`.

## Verification contract

- `dailyScoresPda` uses `daily_scores_roots` plus epoch day encoded as u16 little-endian.
- `merkleRootFromLeaf` and `verifyMerklePath` locally apply directional SHA-256 paths to an already-canonical leaf hash.
- `verifyView` loads the pinned network IDL, derives the daily PDA from the bundle timestamp, attaches a 1.4M-CU instruction, and performs a read-only `validateStatV2` simulation.
- `buildValidateIx` returns the instruction, account mapping, and compute pre-instruction for composition.
- IDL/network mismatches and missing simulation wallets fail with typed, actionable errors.
- Known program errors such as `InvalidMainTreeProof` and `IncompleteStatCoverage` map to corrective guidance.

## Mainnet proof

The private real recording was never copied into Git or the proof report. It was read from protected local storage and normalized through the package build.

- Fixture `18241006`, seq `108`, stat keys `1,2,3001`: `validateStatV2` view returned `true`.
- Fixture `18241006`, seq `962`, stat keys `1006,1007,1008`: view returned `true`.
- Fixture `18241006`, seq `962`, stat keys `7006,7007,7008`: view returned `true`.
- Derived root PDA: `6d9bJ2EtjAFj2k3CKbe2VV8qZ5BgdBnGsYjWApxHWgtE`.
- Built instruction program: `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`.
- Built discriminator: `208,215,194,214,241,71,246,178`, matching the pinned IDL.
- Built payload: 660 bytes, one account, one compute-budget pre-instruction.
- No transaction was submitted and no funds were spent.

## Automated validation

- Strict TypeScript typecheck: PASS.
- Vitest: 34/34 PASS.
- Coverage: 92.38% statements/lines, 85.16% branches, 97.87% functions — PASS.
- ESM/CommonJS builds, declarations, source maps, and proof/onchain subpath exports: PASS.
- Three independent mainnet proof simulations: 3/3 PASS.
- Instruction-build inspection: PASS.

## Deliberate safety gate

TxLINE's deployed program demonstrably uses SHA-256, but exact score-stat leaf canonicalization is not documented and naive Borsh candidates did not reproduce captured event-stat roots. Therefore the public API exposes local path verification from an already-canonical leaf hash, not a misleading `verifyLocal(bundle)`. Full bundle-local verification remains a required later release gate after multiple root reproductions.

Stat proof validity also remains separate from lifecycle finality. Later settlement requires explicit finalisation evidence in addition to the proven score predicate.
